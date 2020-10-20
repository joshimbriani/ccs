const puppeteer = require('puppeteer');
const fs = require('fs');

const readJson = (path) => {
    const data = fs.readFileSync(path)
    return JSON.parse(data);
}

const JSSoup = require('jssoup').default;

const scrapePage = (page) => {
    const soup = new JSSoup(page);
    const tag = soup.find('table', {'id': 'table_coasters'});

    // The table_coasters table always starts with a header
    const firstTHead = tag.nextElement;
    
    let pointer = firstTHead;
    let unordered = false;
    let credits = [];

    // Loop over every sibling tag of the first head
    while (pointer.nextSibling) {
        pointer = pointer.nextSibling;

        if (pointer.name === 'thead') {
            // Once we get to the unsure ordering, flip the bit
            if (pointer.text.includes('No date')) {
                unordered = true;
            }
        } else if (pointer.name === 'tr') {
            // Each coaster is a tr

            // The RCDB id is store on a data attribute
            const rcdbId = pointer.attrs['data-coaster-id'];

            // The ride sequence is stored in a td with the class 'number'
            let number = '?';
            if (!unordered) {
                const numberElement = pointer.find('td', {'class': 'number'});
                number = !numberElement.text.length ? '-1' : numberElement.text;
            }
            
            // The coaster name is in a td with class coaster_row
            const coasterNameElement = pointer.find('td', {'class': 'coaster_row'});
            const coasterName = coasterNameElement.text.replace('*', '').replace(/\d\s+\/\d/, '');
            
            // The date ridden is in a span with class count_date
            // Also need to strip whitespace and get rid of the null date
            const dateElement = pointer.find('span', {'class': 'count_date'});
            const date = dateElement.text.replace(/\s+/g, '').replace('Nodate', '');
            
            // Add the credit to our list
            credits.push({
                'rcdbId': rcdbId,
                'number': number,
                'name': coasterName,
                'dateRidden': date
            });
        }
    }

    // Now write the credits to a csv
    const keys = ['rcdbId', 'number', 'name', 'dateRidden'];
    const csv = keys.join(',') + '\n' + credits.map((credit) => {
        return keys.map(key => credit[key]).join(',')
    }).join('\n');

    fs.writeFileSync('./data/credits-' + Date.now() + '.csv', csv);
}

(async () => {
    const data = readJson('credentials.json');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Go to the login page
    await page.goto('https://coaster-count.com/account/login');

    // Input your login data
    await page.type('input[id=login_email]', data.email);
    await page.type('input[id=login_password]', data.password);

    // Click on the submit button and wait for navigation
    await page.click('#login_submit');
    await page.waitForNavigation();

    const response = await page.goto('https://coaster-count.com/user/' + data.id + '/sequence');
    const contents = await response.text();

    scrapePage(contents);

    await browser.close();
})();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataPath = path.join(__dirname, 'data', 'users.json');
const users = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const testUser = 'seyeon';
const testPass = '1234';

const user = users.find(u => u.username === testUser);

if (!user) {
    console.log('User not found:', testUser);
} else {
    console.log('User found:', user.username);
    console.log('Stored Hash:', user.password);

    bcrypt.compare(testPass, user.password).then(isValid => {
        console.log(`Password '${testPass}' valid?`, isValid);
    }).catch(err => {
        console.error('Bcrypt error:', err);
    });
}

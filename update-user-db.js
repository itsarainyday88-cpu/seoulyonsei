const fs = require('fs');
const path = require('path');

const bcrypt = require('bcryptjs');

const dataPath = path.join(__dirname, 'data', 'users.json');
const users = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

users[0].username = 'seyeon';
users[0].password = bcrypt.hashSync('1234', 10);
users.length = 1;

fs.writeFileSync(dataPath, JSON.stringify(users, null, 2));
console.log('User DB updated with username: seyeon');

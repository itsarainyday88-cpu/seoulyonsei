const { exec } = require('child_process');
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = "https://google.com";

// Attempt 1: original
exec(`"${chromePath}" "${url}"`, (err, stdout, stderr) => {
    console.log("Original result:", err ? err.message : "Success");
});

// Attempt 2: my fix
exec(`""${chromePath}" "${url}""`, (err, stdout, stderr) => {
    console.log("My Fix result:", err ? err.message : "Success");
});

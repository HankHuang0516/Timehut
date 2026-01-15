const fs = require('fs');
const { execSync } = require('child_process');

// Configuration
const HTML_FILE = 'settings.html';
const SERVER_FILE = 'server/server.js';
const VERSION_FILE = 'deploy_version.txt';

// 1. Internal Code Verification
console.log('🔍 Verifying code...');
try {
    execSync('node --check server/server.js', { stdio: 'inherit' });
    console.log('✅ Server code syntax verified.');
} catch (error) {
    console.error('❌ Server code verification failed!');
    process.exit(1);
}

// 2. Get/Increment Version Number
let version = 1;
if (fs.existsSync(VERSION_FILE)) {
    version = parseInt(fs.readFileSync(VERSION_FILE, 'utf8')) + 1;
}
fs.writeFileSync(VERSION_FILE, version.toString());
const versionString = `Deploy to GitHub Pages #${version}`;
console.log(`🚀 Preparing release: ${versionString}`);

// 3. Update Frontend (settings.html)
console.log('📝 Updating Frontend...');
try {
    let htmlContent = fs.readFileSync(HTML_FILE, 'utf8');
    // Regex to find and replace the version span content
    // Looks for: Frontend Version: <span id="fe-version">...</span>
    const feRegex = /(Frontend Version: <span id="fe-version">)(.*?)(<\/span>)/;
    if (feRegex.test(htmlContent)) {
        htmlContent = htmlContent.replace(feRegex, `$1${versionString} (${new Date().toISOString().split('T')[0]})$3`);
        fs.writeFileSync(HTML_FILE, htmlContent);
        console.log('✅ settings.html updated.');
    } else {
        console.warn('⚠️ Could not find "fe-version" span in settings.html');
    }
} catch (e) {
    console.error('❌ Failed to update settings.html:', e);
}

// 4. Update Backend (server/server.js)
console.log('📝 Updating Backend...');
try {
    let jsContent = fs.readFileSync(SERVER_FILE, 'utf8');
    // Regex to find the first debug message line usually: console.log(`Backend Version...`) or similar
    // User requested: "Update version number to debug message's first line"
    // We look for the server start log block
    /*
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    */
    // We will inject/update a specific log line for the version

    // Pattern: Look for console.log(`Deploy Version: ...`) or insert it if missing after app.listen
    const versionLogPattern = /console\.log\(`Deploy Version: .*?`\);/;
    const newLogLine = `console.log(\`Deploy Version: ${versionString}\`);`;

    if (versionLogPattern.test(jsContent)) {
        jsContent = jsContent.replace(versionLogPattern, newLogLine);
    } else {
        // Insert after "Server is running..."
        jsContent = jsContent.replace(
            /console\.log\(`Server is running on port \$\{PORT\}`\);/,
            `console.log(\`Server is running on port \$\{PORT\}\`);\n    ${newLogLine}`
        );
    }

    fs.writeFileSync(SERVER_FILE, jsContent);
    console.log('✅ server.js updated.');
} catch (e) {
    console.error('❌ Failed to update server.js:', e);
}

console.log('✨ Version update complete.');

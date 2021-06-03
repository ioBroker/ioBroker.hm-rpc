const fs = require('fs');
const { exec } = require("child_process");


const files = fs.readdirSync(__dirname).filter(n => n.endsWith('.png'));

function getSize(name) {
    return new Promise(resolve =>
        exec(`imageMagic\\identify  -ping -format %[fx:w]x%[fx:h] ${name}`, (error, stdout, stderr) => {
            const [x,y] = stdout.split('x');
            resolve({x: x - 1, y: y - 1});
        }));
}

async function buildLines() {
    const lines = [];
    for (let n = 0; n < files.length; n++) {
        const name = files[n];
        console.log(n + ' / ' + files.length);
        const size = await getSize(name);
        lines.push(`imageMagic\\magick ${name} -fill none -draw "alpha 0,0 floodfill" -draw "alpha ${size.x}, ${size.y} floodfill" -draw "alpha 0,${size.y} floodfill" -draw "alpha ${size.x},0 floodfill" -channel alpha -blur 0x2 result\\${name}`);
        lines.push(`imageMagic\\magick.exe result\\${name} -brightness-contrast 0x10 result\\${name}`);
    }

    fs.writeFileSync(__dirname + '\\remove.bat', lines.join('\n'));
}

buildLines();


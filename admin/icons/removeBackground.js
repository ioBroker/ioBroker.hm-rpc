const fs = require('fs');
const { exec } = require('child_process');
const { platform } = require('os');

const files = fs.readdirSync(__dirname).filter(n => n.endsWith('.png'));
const os = platform();

// only linux windows supported
if (!os.startsWith('win') && os !== 'linux') {
    throw new Error(`Unsupported operating system: ${os}`);
}

function getSize(name) {
    return new Promise(resolve => {
        exec(`${os.startsWith('win') ? 'imageMagic\\identify' : 'identify'} -ping -format %[fx:w]x%[fx:h] ${name}`, (error, stdout) => {
            const [x,y] = stdout.split('x');
            resolve({x: x - 1, y: y - 1});
        });
    });
}

async function buildLines() {
    const lines = [];
    for (let n = 0; n < files.length; n++) {
        const name = files[n];
        console.log(`${n + 1} / ${files.length}`);
        const size = await getSize(name);
        if (os.startsWith('win')) {
            lines.push(`imageMagic\\magick ${name} -fill none -draw "alpha 0,0 floodfill" -draw "alpha ${size.x},${size.y} floodfill" -draw "alpha 0,${size.y} floodfill" -draw "alpha ${size.x},0 floodfill" -channel alpha -blur 0x2 result\\${name}`);
            lines.push(`imageMagic\\magick.exe result\\${name} -brightness-contrast 0x10 result\\${name}`);
        } else {
            lines.push(`convert ${name} -fill none -draw "matte 0,0 floodfill" -draw "matte ${size.x},${size.y} floodfill" -draw "matte 0,${size.y} floodfill" -draw "matte ${size.x},0 floodfill" -channel alpha -blur 0x2 result/${name}`);
            lines.push(`convert result/${name} -brightness-contrast 0x10 result/${name}`);
        }
    }

    if (os.startsWith('win')) {
        fs.writeFileSync(`${__dirname}\\remove.bat`, lines.join('\n'));
    } else {
        fs.writeFileSync(`${__dirname}/remove.sh`, 'mkdir result\n' + lines.join('\n'));
    }
}

buildLines();
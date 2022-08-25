import fs from 'fs';
import { exec } from 'child_process';
import { platform } from 'os';

const files = fs.readdirSync('admin/icons').filter(n => n.endsWith('.png'));
const os = platform();

// only linux windows supported
if (!os.startsWith('win') && os !== 'linux') {
    throw new Error(`Unsupported operating system: ${os}`);
}

interface Size {
    x: number;
    y: number;
}

function getSize(name: string): Promise<Size> {
    return new Promise(resolve => {
        exec(
            `${
                os.startsWith('win') ? 'imageMagic\\identify' : 'identify'
            } -ping -format %[fx:w]x%[fx:h] admin/icons/${name}`,
            (error, stdout) => {
                const [x, y] = stdout.split('x');
                resolve({ x: parseInt(x) - 1, y: parseInt(y) - 1 });
            }
        );
    });
}

// TODO: it seems like the script messes up images which have their background already removed
export async function buildLines(): Promise<void> {
    console.log('Building script to remove background');
    const lines = [];
    for (let n = 0; n < files.length; n++) {
        const name = files[n];
        console.log(`${n + 1} / ${files.length}`);
        const size = await getSize(name);
        if (os.startsWith('win')) {
            lines.push(
                `imageMagic\\magick admin/icons/${name} -fill none -draw "alpha 0,0 floodfill" -draw "alpha ${size.x},${size.y} floodfill" -draw "alpha 0,${size.y} floodfill" -draw "alpha ${size.x},0 floodfill" -channel alpha -blur 0x2 result\\${name}`
            );
            lines.push(`imageMagic\\magick.exe result\\${name} -brightness-contrast 0x10 result\\${name}`);
        } else {
            lines.push(
                `convert admin/icons/${name} -fill none -draw "matte 0,0 floodfill" -draw "matte ${size.x},${size.y} floodfill" -draw "matte 0,${size.y} floodfill" -draw "matte ${size.x},0 floodfill" -channel alpha -blur 0x2 result/${name}`
            );
            lines.push(`convert result/${name} -brightness-contrast 0x10 result/${name}`);
        }
    }

    if (os.startsWith('win')) {
        fs.writeFileSync(`remove.bat`, lines.join('\n'));
    } else {
        fs.writeFileSync(`remove.sh`, 'mkdir result\n' + lines.join('\n'));
    }
    console.log('Script saved.');
}

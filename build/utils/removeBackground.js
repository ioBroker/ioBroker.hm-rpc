"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLines = void 0;
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const os_1 = require("os");
const files = fs_1.default.readdirSync('admin/icons').filter(n => n.endsWith('.png'));
const os = (0, os_1.platform)();
// only linux windows supported
if (!os.startsWith('win') && os !== 'linux') {
    throw new Error(`Unsupported operating system: ${os}`);
}
function getSize(name) {
    return new Promise(resolve => {
        (0, child_process_1.exec)(`${os.startsWith('win') ? 'imageMagic\\identify' : 'identify'} -ping -format %[fx:w]x%[fx:h] admin/icons/${name}`, (error, stdout) => {
            const [x, y] = stdout.split('x');
            resolve({ x: parseInt(x) - 1, y: parseInt(y) - 1 });
        });
    });
}
// TODO: it seems like the script messes up images which have their background already removed
async function buildLines() {
    console.log('Building script to remove background');
    const lines = [];
    for (let n = 0; n < files.length; n++) {
        const name = files[n];
        console.log(`${n + 1} / ${files.length}`);
        const size = await getSize(name);
        if (os.startsWith('win')) {
            lines.push(`imageMagic\\magick admin/icons/${name} -fill none -draw "alpha 0,0 floodfill" -draw "alpha ${size.x},${size.y} floodfill" -draw "alpha 0,${size.y} floodfill" -draw "alpha ${size.x},0 floodfill" -channel alpha -blur 0x2 result\\${name}`);
            lines.push(`imageMagic\\magick.exe result\\${name} -brightness-contrast 0x10 result\\${name}`);
        }
        else {
            lines.push(`convert admin/icons/${name} -fill none -draw "matte 0,0 floodfill" -draw "matte ${size.x},${size.y} floodfill" -draw "matte 0,${size.y} floodfill" -draw "matte ${size.x},0 floodfill" -channel alpha -blur 0x2 result/${name}`);
            lines.push(`convert result/${name} -brightness-contrast 0x10 result/${name}`);
        }
    }
    if (os.startsWith('win')) {
        fs_1.default.writeFileSync(`remove.bat`, lines.join('\n'));
    }
    else {
        fs_1.default.writeFileSync(`remove.sh`, 'mkdir result\n' + lines.join('\n'));
    }
    console.log('Script saved.');
}
exports.buildLines = buildLines;
//# sourceMappingURL=removeBackground.js.map
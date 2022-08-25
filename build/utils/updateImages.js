"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const removeBackground_1 = require("./removeBackground");
const FOLDER_URL = 'https://github.com/eq-3/occu/tree/master/WebUI/www/config/img/devices/50';
(0, child_process_1.exec)(`fetcher --url="${FOLDER_URL}" --out=tmp`, async (err, stdout, stderr) => {
    if (err) {
        console.error(`Error: ${err.message} (${stderr})`);
    }
    else {
        console.log('Successfully downloaded images');
        try {
            await moveImages();
            // Create script to remove background of images
            await (0, removeBackground_1.buildLines)();
        }
        catch (e) {
            console.error(`Could not move images: ${e.message}`);
        }
    }
});
/**
 * Moves the images from tmp dir to admin dir
 */
async function moveImages() {
    const content = await fs_1.default.promises.readdir('tmp/50', { withFileTypes: true });
    const existingContent = await fs_1.default.promises.readdir('admin/icons', { withFileTypes: true });
    for (const file of content) {
        if (file.isDirectory()) {
            continue;
        }
        const isNew = !existingContent.find(entry => entry.name === file.name);
        if (isNew) {
            console.log(`New image: ${file.name}`);
        }
        // move items in all cases, maybe they have changed
        await fs_1.default.promises.cp(`tmp/50/${file.name}`, `admin/icons/${file.name}`);
    }
    await fs_1.default.promises.rm('tmp', { recursive: true });
    console.log('Successfully deleted temporary directory');
}
//# sourceMappingURL=updateImages.js.map
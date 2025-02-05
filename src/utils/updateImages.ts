import { exec } from 'child_process';
import fs from 'fs';
import { buildLines } from './removeBackground';

const FOLDER_URL = 'https://github.com/eq-3/occu/tree/master/WebUI/www/config/img/devices/50';

exec(`fetcher --url="${FOLDER_URL}" --out=tmp`, async (err, stdout, stderr) => {
    if (err) {
        console.error(`Error: ${err.message} (${stderr})`);
    } else {
        console.log('Successfully downloaded images');
        try {
            await moveImages();
            // Create a script to remove background of images
            await buildLines();
        } catch (e: any) {
            console.error(`Could not move images: ${e.message}`);
        }
    }
});

/**
 * Moves the images from tmp dir to admin dir
 */
async function moveImages(): Promise<void> {
    const content = await fs.promises.readdir('tmp/50', { withFileTypes: true });
    const existingContent = await fs.promises.readdir('admin/icons', { withFileTypes: true });

    for (const file of content) {
        if (file.isDirectory()) {
            continue;
        }

        const isNew = !existingContent.find(entry => entry.name === file.name);

        if (isNew) {
            console.log(`New image: ${file.name}`);
        }

        // move items in all cases, maybe they have changed
        await fs.promises.cp(`tmp/50/${file.name}`, `admin/icons/${file.name}`);
    }

    await fs.promises.rm('tmp', { recursive: true });
    console.log('Successfully deleted temporary directory');
}

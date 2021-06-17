const puppeteer = require('puppeteer');
const path = require('path');
const Event = require('events');
const fs = require('fs');
const Downloader = require('nodejs-file-downloader');

const emitter = new Event();

/* config start */
const concurrent_count = 5;
const manhuaindex_begin = 1;
const manhuaindex_end = 100; // max 970
/* config end */

let currentmanhuaindex = manhuaindex_begin;
let current_childs = 0;

function startChlid(begin, end) {
        current_childs ++;
        start_child_work(begin, end);
}

function child_exit() {
        current_childs --;
        emitter.emit('child-exit');
}

const start_child_work = async (manhuaindexbegin, manhuaindexend) => {
        const browser = await puppeteer.launch({ headless: true});
        const page = await browser.newPage();
        const micPage = await browser.newPage();
        let dirtitle = '';
        for (let manhuaindex = manhuaindexbegin; manhuaindex < manhuaindexend; ++manhuaindex) {
                let links = [];
                try {
                        await page.goto(`https://pphanman.com/comic_${manhuaindex}.html`, { waitUntil: 'domcontentloaded' });
                        links = await page.evaluate(() => {
                                const links = [];
                                document.querySelectorAll('a.j-chapter-link').forEach(item => {
                                        links.push(item.href);
                                });
                                return links;
                        });
                } catch(e) {
                        manhuaindex--;
                        continue;
                }
            dirtitle = await page.evaluate(() => {
                        return document.title;
                });
                for (let i = 0; i < links.length; ++i) {
                        micPage.goto(links[i], {
                                waitUntil: 'domcontentloaded'
                        });
                        let srcs = [];
                        let title = null;
                        try {
                                await micPage.waitForFunction(() => {
                                        return document.querySelectorAll("div.rd-article__pic img").length !== 0;
                                });
                                title = await micPage.evaluate(() => {
                                        return document.title;
                                });
                                console.log(title);
                                srcs = await micPage.evaluate(() => {
                                        const imgs = [];
                                        document.querySelectorAll("div.rd-article__pic img").forEach(item => {
                                                imgs.push(item.dataset.original);
                                        });
                                        return imgs;
                                });
                        } catch(e)  {
                            i -= 1;
                            console.log('page load error, repeat');
                            try {

                                await page.reload({ waitUntil: 'domcontentloaded'})
                            }catch(e) {
                            }
                            await new Promise(resolve => {
                                setTimeout(resolve, 1000);
                            });
                            continue;
                        }

                        title = title.replace(/[/\\?%*:|"<>]/g, '-');
                        dirtitle = dirtitle.replace(/[/\\?%*:|"<>]/g, '-');
                        try {
                                await Promise.allSettled(srcs.map((src, index) => {
                                        const fullpath = './download/' + manhuaindex + dirtitle + '/' + title + '/' + index + '.webp';
                                        if (fs.existsSync(fullpath)) {
                                                console.log(fullpath, 'safe skiped');
                                                return Promise.resolve();
                                        }
                                        console.log('download: ', fullpath);
                                        const downloader = new Downloader({
                                                url: src,
                                                maxAttempts: 3,
                                                directory: './download/' + manhuaindex + dirtitle + '/' + title,
                                                fileName: index + '.webp'
                                        });
                                        return downloader.download();
                                })).then(promises => {
                                        promises.forEach((p) => {
                                                if (p.status === 'rejected') {
                                                        throw p;
                                                }
                                        })
                                });
                        } catch(e) {
                            console.log('download error: ', e);
                            i -= 1;
                            try {

                                await page.reload({ waitUntil: 'domcontentloaded'})
                            }catch(e) {
                            }
                            await new Promise(resolve => {
                                setTimeout(resolve, 1000);
                            });
                            continue;
                        }
                        console.log('complete: ', title);
                }
        }
        await page.close();
        await micPage.close();
        await browser.close();
        child_exit();
};

emitter.on('child-exit', () => {
        while ((current_childs < concurrent_count) && (currentmanhuaindex < manhuaindex_end)) {
                console.log('启动新进程');
                // 每个漫画任务完成 0-10个任务
                startChlid(currentmanhuaindex, Math.min(currentmanhuaindex + 5, manhuaindex_end));
                currentmanhuaindex += 5;
        }
});


(async () => {

        emitter.emit('child-exit');
})();
// 启动任务

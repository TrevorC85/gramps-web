// Playwright screenshot tests of the link lines, against LOCAL instances only:
// synthetic fictional tree on 127.0.0.1:5057, copy of the real local tree on
// 127.0.0.1:5058. Never point this at the live site.
export default {
  testDir: './tests',
  workers: 1,
  timeout: 120000,
  reporter: [['list'], ['json', {outputFile: '/workspace/gramps-web/build/tree-proto/v2/playwright-results.json'}]],
  use: {
    launchOptions: {executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']},
    viewport: {width: 1600, height: 1000},
    acceptDownloads: true,
  },
}

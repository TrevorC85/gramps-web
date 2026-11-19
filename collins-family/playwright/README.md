# Link-line browser tests (Collins family fork)

Playwright tests of the tree link lines (relation colour, confidence width, up to four
parents, one line per parent, legend, badge, privacy). They run against **local test
instances only** and must never be pointed at the live site:

- `127.0.0.1:5057`: the synthetic, fictional tree made by
  `collins-family/tools/make_synthetic_link_tree.py` in the API fork (users synth_owner,
  synth_member, synth_guest; passwords in `/workspace/gramps-web-proto/synthetic/secrets/users.json`).
- `127.0.0.1:5058`: a copy of the local tree (owner login from `/workspace/gramps-web/.admin_password`,
  member/guest from `/workspace/gramps-web-proto/realcopy/secrets/users.json`).

Credentials are read from those files at run time; none are in git.

```
npm ci && npx playwright test     # uses /usr/bin/google-chrome
```

Screenshots and `playwright-results.json` go to `/workspace/gramps-web/build/tree-proto/v2/`.

# Building Clear

`index.html` at the repo root is generated. Do not edit it by hand. Edit `src/clear-app.jsx` and rebuild.

## Once

```
npm install
```

## Every change

1. Edit `src/clear-app.jsx`.
2. Bump `const BUILD = "1.8"` near the top of that file, so you can tell from the Report tab which version is live.
3. ```
   node build/build.mjs
   ```
4. Test locally before committing:
   ```
   npx serve .
   ```
   Open the page it prints. Check the screen you changed, then check the Report tab shows the new version number.
5. Commit `src/clear-app.jsx` and `index.html` together.

GitHub Pages redeploys within a minute or two.

## What the pieces are

| File | What it is |
| --- | --- |
| `src/clear-app.jsx` | The whole app. One file on purpose. |
| `build/template.html` | The HTML shell: meta tags, manifest, icon, boot screen. `__BUNDLE__` is where the compiled app goes. |
| `build/build.mjs` | Bundles the source and inlines it into the template. |
| `index.html` | Generated output. The entire app in one file. |
| `sw.js` | Service worker. Network first with a cache fallback, so updates reach people without a version bump. |

## Before you push

`esbuild` checks syntax but says nothing about undefined variables, which is how several crashes reached the live app during development. Worth a scan:

```
npm i acorn acorn-walk
node -e "
const fs=require('fs'),acorn=require('acorn'),walk=require('acorn-walk');
const ast=acorn.parse(fs.readFileSync('index.html','utf8').match(/<script>\n([\s\S]*?)\n<\/script>/g).sort((a,b)=>b.length-a.length)[0].replace(/<\/?script>/g,''),{ecmaVersion:2022});
const d=new Set();const c=q=>{if(!q)return;if(q.type==='Identifier')d.add(q.name);
 else if(q.type==='ObjectPattern')q.properties.forEach(p=>c(p.value||p.argument));
 else if(q.type==='ArrayPattern')q.elements.forEach(c);
 else if(q.type==='AssignmentPattern')c(q.left);else if(q.type==='RestElement')c(q.argument);};
walk.full(ast,n=>{if(n.type==='VariableDeclarator')c(n.id);
 if((n.type==='FunctionDeclaration'||n.type==='ClassDeclaration')&&n.id)d.add(n.id.name);
 if(/Function(Declaration|Expression)|ArrowFunctionExpression/.test(n.type))n.params.forEach(c);
 if(n.type==='CatchClause')c(n.param);});
const g=new Set(Object.getOwnPropertyNames(globalThis).concat(['window','document','navigator','fetch','localStorage','AbortController','URLSearchParams','FileReader','Blob','URL','undefined','NaN','Infinity','arguments','React']));
const u=new Set();walk.full(ast,n=>{if(n.type==='Identifier')u.add(n.name);});
const miss=[...u].filter(x=>!d.has(x)&&!g.has(x));
console.log(miss.length?'UNDEFINED: '+miss.join(', '):'scan clean');"
```

## Things that will bite you

- **Never rename the repo or move to a different address.** Everyone's data is scoped to the exact origin. Changing it orphans every user's log with no warning and no way to reach them.
- **Migrations are one-way and must chain.** Someone may not open the app for months and jump several schema versions at once. Test any new migration against an old exported backup, not just current data.
- **A crash on load is the worst failure.** The app can't be opened, so its export button can't be reached either. There is a rescue screen for this, but the real protection is testing locally before committing.

# Handing this project to a new chat

Paste the block below into a fresh conversation. The repo is public, so the assistant can read the live source and current build straight from it — no need to re-upload anything.

---

I'm continuing work on a web app called Clear. It's a private log for bronchiectasis: local-only data, no server, installed to the home screen. It's live and other people are starting to use it.

Repo: https://github.com/morgangisele28/Clear
Live: https://morgangisele28.github.io/Clear/

Read these first, from the raw URLs so you get the real files:

- https://raw.githubusercontent.com/morgangisele28/Clear/main/src/clear-app.jsx — the entire app, one file
- https://raw.githubusercontent.com/morgangisele28/Clear/main/BUILD.md — how to build and what to check before pushing
- https://raw.githubusercontent.com/morgangisele28/Clear/main/clear-build-brief.md — the design and product brief, including a list of approaches that were built and rejected

How changes work: edit src/clear-app.jsx, bump the BUILD constant, run node build/build.mjs to regenerate index.html, commit both.

Two things that have caused real bugs, so please hold to them:

1. Assert on every find-and-replace. Several crashes reached users because an edit script printed success while its pattern silently failed to match.
2. Run the undefined-identifier scan in BUILD.md after every change. esbuild compiles undefined variables happily; that is how DOSE_TARGET, airSection, cap and MiniChart each shipped broken.

I'd like you to [what you want done].

---

## Also worth knowing

The assistant in the new chat can search this conversation's history if you ask it to, so specific decisions can be recalled without you re-explaining them.

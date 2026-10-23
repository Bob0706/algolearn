# Bhumik Patel — Portfolio

An animated, single-page portfolio site built with plain HTML, CSS and JavaScript. It has no build step and no dependencies.

```
portfolio/
├── index.html                    # the page
├── styles.css                    # theme, layout, animations
├── script.js                     # particles, typing, tilt, cursor, filters, reveals
├── assets/bhumik.webp            # profile photo
├── assets/Bhumik_Patel_Resume.pdf
└── resume/resume.html            # source of the resume PDF
```

## Features
Preloader · particle network that reacts to the mouse · typing role text · morphing gradient photo frame · floating tech chips · custom cursor · magnetic buttons · 3D tilt and spotlight cards · scroll progress bar · scroll-reveal and count-up stats · animated project previews (line chart, candles, terminal, gauge) · project filters · timeline that fills as you scroll · dark/light theme (remembered) · mobile menu · respects "reduce motion".

## Preview locally
```bash
cd portfolio && python3 -m http.server 8000   # open http://localhost:8000
```

## Deploy (free)
- **Vercel / Netlify:** import the repo and set the root directory to `portfolio`. No build command is needed.
- **GitHub Pages:** copy this folder into a repo named `Bob0706.github.io` (or a `portfolio` repo) and turn on Pages for the `main` branch.

## Editing
- Text, projects and links live in `index.html`.
- Colours are the CSS variables at the top of `styles.css`.
- The roles in the typing animation are the `roles` array in `script.js`.
- To change the resume, edit `resume/resume.html`, open it in Chrome, choose **Print → Save as PDF** (A4, margins: none, background graphics on), and save it over `assets/Bhumik_Patel_Resume.pdf`.
- The contact form opens the visitor's email app. To receive messages directly instead, create a free [Web3Forms](https://web3forms.com) key and point the form at it.

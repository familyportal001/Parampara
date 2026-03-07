# fonts/

This folder holds the self-hosted woff2 font files for Parampara.

Run `download_fonts.sh` from the project root once to populate it:

```bash
chmod +x download_fonts.sh
./download_fonts.sh
```

## Expected files

| File | Font | Weight | Style |
|------|------|--------|-------|
| crimson-pro-300.woff2 | Crimson Pro | 300 (Light) | Normal |
| crimson-pro-400.woff2 | Crimson Pro | 400 (Regular) | Normal |
| crimson-pro-600.woff2 | Crimson Pro | 600 (SemiBold) | Normal |
| crimson-pro-300-italic.woff2 | Crimson Pro | 300 (Light) | Italic |
| dm-sans-300.woff2 | DM Sans | 300 (Light) | Normal |
| dm-sans-400.woff2 | DM Sans | 400 (Regular) | Normal |
| dm-sans-500.woff2 | DM Sans | 500 (Medium) | Normal |

## Why self-hosted?

The app previously loaded fonts from `fonts.googleapis.com`. Every page load
caused a request to Google's servers, which Google may log. Self-hosting
eliminates this third-party request entirely, improving privacy and load speed.

The font-family stacks in the CSS include `Georgia` / `system-ui` fallbacks,
so the app remains fully functional even if these files are missing.

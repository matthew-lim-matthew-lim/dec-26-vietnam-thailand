# Vietnam and Thailand, Dec 2026

Trip site for Matthew and Amy, 19 December 2026 to 3 January 2027: Saigon, then Phu Quoc or Ninh Binh (switch at the top of the page), then Bangkok. The Phu Quoc version uses `data/trip-phuquoc.json` and `data/budget-phuquoc.json`.

- **Trip map**: pick a day, click a numbered dot to see that stop (time, photo, opening hours, cost, booking and TikTok links), then press **Next** or the right arrow key to follow the day in order. Arrows (›) on the map show the direction of travel, with an icon for how you get there (🚶 🚕 🚇 ⛴️ 🛵 ✈️); 🏨 marks the hotel. On a phone the details sit in a sheet you can drag up. A dot with several numbers is a place visited more than once; clicking it again steps through those visits.
- **Budget**: planned spend by category, in Australian dollars, for both travellers.

Links like `#day6/3` open a specific day and stop.

## Files

- `index.html`, `assets/` – the site (plain HTML, CSS and JavaScript, with Leaflet and OpenStreetMap for the map).
- `data/trip.json` – every day and stop. Edit this to change the plan.
- `data/budget.json` – the planned budget items.
- `data/media.json` – TikTok video IDs for each place, keyed by its TikTok tag.
- `data/places.json` – the Google Maps place ID for each real stop, keyed by the stop's `place`. The site loads up to six photos per place from the Places API (New) in the browser. The key in `assets/app.js` is restricted to the github.io domain, so photos don't show when the site runs locally.

The Google Sheet "December 2026 Vietnam" has the same plan and tracks actual spending.

## Run it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk will not load the data.

## Publishing

`.github/workflows/jekyll-gh-pages.yml` deploys the site to GitHub Pages on every push to `main` (Settings → Pages → Source must be **GitHub Actions**).

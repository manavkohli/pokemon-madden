import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scrape_pokedex


class PokedexChecks(unittest.TestCase):
    def test_reordered_rows_keep_canonical_ids(self):
        entries = json.loads((scrape_pokedex.ROOT / "pokemon_gen1_2.json").read_text(encoding="utf-8"))["pokemon"]
        rows = []
        for entry in reversed(entries):
            cells = [
                str(entry["id"]),
                f'<a class="ent-name">{entry["name"]}</a>',
                " ".join(f'<a class="type-icon">{kind}</a>' for kind in entry["types"]),
                *(str(value) for value in entry["base_stats"].values()),
            ]
            rows.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in cells) + "</tr>")
        html = '<table id="pokedex">' + "".join(rows) + "</table>"
        scraper = scrape_pokedex.PokedexScraper()
        parsed = scraper.parse(html)
        self.assertEqual(parsed, entries)
        with tempfile.TemporaryDirectory() as directory, patch.object(scrape_pokedex, "ROOT", Path(directory)):
            scraper.save(parsed)
            data = json.loads((Path(directory) / "pokemon_gen1_2.json").read_text(encoding="utf-8"))
            browser = (Path(directory) / "pokemon_gen1_2.js").read_text(encoding="utf-8")
            self.assertEqual(json.loads(browser.removeprefix("window.POKEMON_DATA = ").removesuffix(";\n")), data["pokemon"])
            self.assertEqual(data["pokemon"][28]["name"], "Nidoran♀")


if __name__ == "__main__":
    unittest.main()

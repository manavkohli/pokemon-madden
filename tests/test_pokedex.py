import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scrape_pokedex


class PokedexChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((scrape_pokedex.ROOT / "pokemon_gen1_2.json").read_text(encoding="utf-8"))

    def test_reordered_rows_keep_canonical_ids(self):
        entries = [{key: value for key, value in entry.items() if key != "moves"} for entry in self.data["pokemon"]]
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
            scraper.save(self.data["pokemon"], self.data["moves"], self.data["types"])
            saved = json.loads((Path(directory) / "pokemon_gen1_2.json").read_text(encoding="utf-8"))
            lines = (Path(directory) / "pokemon_gen1_2.js").read_text(encoding="utf-8").splitlines()
            self.assertEqual(saved, self.data)
            names = {"pokemon": "POKEMON_DATA", "moves": "POKEMON_MOVES", "types": "POKEMON_TYPES"}
            for line, (key, name) in zip(lines, names.items()):
                self.assertEqual(json.loads(line.removeprefix(f"window.{name} = ").removesuffix(";")), saved[key])

    def test_move_catalog_and_learnsets(self):
        moves = self.data["moves"]
        pokemon = {entry["name"]: entry for entry in self.data["pokemon"]}
        self.assertEqual(len(moves), 251)
        self.assertTrue(all("moves" in entry for entry in self.data["pokemon"]))
        self.assertIn("thunderbolt", pokemon["Pikachu"]["moves"])
        self.assertEqual(pokemon["Ditto"]["moves"], ["transform"])
        self.assertEqual(moves["thunderbolt"]["type"], "Electric")
        self.assertEqual(moves["thunderbolt"]["meta"]["ailment"], "paralysis")
        self.assertTrue(all(name in moves for entry in self.data["pokemon"] for name in entry["moves"]))

    def test_gen_2_type_chart(self):
        types = self.data["types"]
        self.assertEqual(len(types), 17)
        self.assertNotIn("Fairy", types)
        self.assertEqual(types["Electric"]["Ground"], 0)
        self.assertEqual(types["Ghost"]["Steel"], 0.5)
        self.assertEqual(types["Dark"]["Steel"], 0.5)
        self.assertEqual(types["Water"]["Fire"], 2)
        self.assertTrue(all(target in types for row in types.values() for target in row))

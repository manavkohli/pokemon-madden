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
        entries = [{key: value for key, value in entry.items() if key not in ("moves", "evolutions")} for entry in self.data["pokemon"]]
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

    def evolution(self, name, target):
        pokemon = {entry["id"]: entry for entry in self.data["pokemon"]}
        source = next(entry for entry in self.data["pokemon"] if entry["name"] == name)
        return next(step for step in source["evolutions"] if pokemon[step["into"]]["name"] == target)

    def test_evolution_triggers(self):
        bulbasaur = self.evolution("Bulbasaur", "Ivysaur")
        self.assertEqual((bulbasaur["trigger"], bulbasaur["min_level"]), ("level-up", 16))
        self.assertEqual(self.evolution("Pikachu", "Raichu")["item"], "thunder-stone")
        self.assertEqual(self.evolution("Kadabra", "Alakazam")["trigger"], "trade")
        self.assertEqual(self.evolution("Golbat", "Crobat")["trigger"], "friendship")
        self.assertEqual(self.evolution("Eevee", "Flareon")["item"], "fire-stone")

    def test_evolutions_stay_in_the_catalog(self):
        steps = [step for entry in self.data["pokemon"] for step in entry["evolutions"]]
        self.assertTrue(steps)
        self.assertTrue(all(1 <= step["into"] <= 251 for step in steps))
        self.assertTrue(all(step["min_level"] for step in steps if step["trigger"] == "level-up"))

    def test_roster_uses_gen_2_types(self):
        pokemon = {entry["name"]: entry for entry in self.data["pokemon"]}
        self.assertNotIn("Fairy", {kind for entry in self.data["pokemon"] for kind in entry["types"]})
        self.assertEqual(pokemon["Clefairy"]["types"], ["Normal"])
        self.assertEqual(pokemon["Togetic"]["types"], ["Normal", "Flying"])
        self.assertEqual(pokemon["Magnemite"]["types"], ["Electric", "Steel"])

    def test_gen_2_type_chart(self):
        types = self.data["types"]
        self.assertEqual(len(types), 17)
        self.assertNotIn("Fairy", types)
        self.assertEqual(types["Electric"]["Ground"], 0)
        self.assertEqual(types["Ghost"]["Steel"], 0.5)
        self.assertEqual(types["Dark"]["Steel"], 0.5)
        self.assertEqual(types["Water"]["Fire"], 2)
        self.assertTrue(all(target in types for row in types.values() for target in row))

    def test_moves_carry_gen_2_values(self):
        moves = self.data["moves"]
        self.assertEqual(moves["charm"]["type"], "Normal")
        self.assertEqual(moves["high-jump-kick"]["power"], 85)
        self.assertEqual(moves["outrage"]["power"], 90)
        self.assertEqual(moves["petal-dance"]["power"], 70)
        self.assertEqual(moves["thunder"]["power"], 120)
        self.assertEqual(moves["tackle"]["power"], 35)
        self.assertEqual(moves["curse"]["type"], "Unknown")
        self.assertNotIn("Fairy", {move["type"] for move in moves.values()})
        self.assertEqual(moves["thunder-punch"]["damage_class"], "special")
        self.assertEqual(moves["outrage"]["damage_class"], "special")
        self.assertEqual(moves["bite"]["damage_class"], "special")
        self.assertEqual(moves["charm"]["damage_class"], "status")

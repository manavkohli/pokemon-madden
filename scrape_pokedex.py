#!/usr/bin/env python3
"""Refresh the Gen I–II roster from Pokémon Database's main Pokédex table."""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = "https://pokemondb.net/pokedex/all"
POKEAPI = "https://pokeapi.co/api/v2"
# Fairy arrived in Gen 6, so the Gen 2 chart has exactly these 17 types.
TYPES = [
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground",
    "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel",
]
# Before Gen 4 a move's damage class followed its type.
# PokeAPI's `past_types` names the generation a type list stopped applying in; the earliest later entry holds the Gen 2 types.
GENERATIONS = [
    "generation-i", "generation-ii", "generation-iii", "generation-iv", "generation-v", "generation-vi",
    "generation-vii", "generation-viii", "generation-ix",
]
PHYSICAL_TYPES = {"Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel"}
SPECIAL_TYPES = {"Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark"}
ROOT = Path(__file__).resolve().parent


@dataclass
class Cell:
    text: list[str] = field(default_factory=list)
    name: list[str] = field(default_factory=list)
    types: list[str] = field(default_factory=list)
    sort_value: str | None = None

    @property
    def value(self) -> str:
        return " ".join(self.text).strip()


class PokedexTable(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_table = False
        self.link_kind: str | None = None
        self.cell: Cell | None = None
        self.row: list[Cell] | None = None
        self.rows: list[list[Cell]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = (attributes.get("class") or "").split()
        if tag == "table" and (attributes.get("id") == "pokedex" or "data-table" in classes):
            self.in_table = True
        if not self.in_table:
            return
        if tag == "tr":
            self.row = []
        elif tag == "td" and self.row is not None:
            self.cell = Cell(sort_value=attributes.get("data-sort-value"))
        elif tag == "a" and self.cell is not None:
            self.link_kind = "name" if "ent-name" in classes else "type" if "type-icon" in classes else None

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if not self.cell or not value:
            return
        self.cell.text.append(value)
        if self.link_kind == "name":
            self.cell.name.append(value)
        elif self.link_kind == "type":
            self.cell.types.append(value)

    def handle_endtag(self, tag: str) -> None:
        if not self.in_table:
            return
        if tag == "a":
            self.link_kind = None
        elif tag == "td" and self.cell is not None and self.row is not None:
            self.row.append(self.cell)
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
        elif tag == "table":
            self.in_table = False


class PokedexScraper:
    def fetch(self) -> str:
        request = Request(SOURCE, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8")

    def parse(self, html: str) -> list[dict]:
        table = PokedexTable()
        table.feed(html)
        entries: dict[int, dict] = {}
        for row in table.rows:
            if len(row) != 10:
                continue
            number = re.search(r"\d{1,4}", row[0].sort_value or row[0].value)
            if not number:
                continue
            dex = int(number.group())
            if dex > 251 or dex in entries:
                continue
            values = [int(cell.value) for cell in row[3:10]]
            total, hp, attack, defense, special_attack, special_defense, speed = values
            types = row[2].types or row[2].value.split()
            entries[dex] = {
                "id": dex,
                "name": " ".join(row[1].name or row[1].text),
                "types": types,
                "base_stats": {
                    "total": total,
                    "hp": hp,
                    "attack": attack,
                    "defense": defense,
                    "special_attack": special_attack,
                    "special_defense": special_defense,
                    "speed": speed,
                },
            }
        if sorted(entries) != list(range(1, 252)):
            raise ValueError(f"Expected National Dex #1–251; found {len(entries)} entries")
        return [entries[dex] for dex in sorted(entries)]

    def save(self, entries: list[dict], moves: dict, types: dict) -> None:
        data = {"source": SOURCE, "pokemon": entries, "moves": moves, "types": types}
        (ROOT / "pokemon_gen1_2.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        compact = {"separators": (",", ":"), "ensure_ascii": False}
        browser = [
            "window.POKEMON_DATA = " + json.dumps(entries, **compact) + ";",
            "window.POKEMON_MOVES = " + json.dumps(moves, **compact) + ";",
            "window.POKEMON_TYPES = " + json.dumps(types, **compact) + ";",
        ]
        (ROOT / "pokemon_gen1_2.js").write_text("\n".join(browser) + "\n", encoding="utf-8")


class PokeApiScraper:
    """Reads Crystal learnsets, Gen 2 types, evolutions, raw Gen 2 move mechanics, and the Gen 2 type chart from PokeAPI."""

    def fetch(self, path: str) -> dict:
        request = Request(f"{POKEAPI}/{path}", headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    def fetch_all(self, paths: list[str]) -> list[dict]:
        with ThreadPoolExecutor(max_workers=8) as pool:
            return list(pool.map(self.fetch, paths))

    def profiles(self) -> dict[int, dict]:
        """Maps each Pokémon id to its Gen 2 types and every move it learns in Crystal by any method."""
        profiles = {}
        for dex, mon in enumerate(self.fetch_all([f"pokemon/{dex}" for dex in range(1, 252)]), start=1):
            later = [entry for entry in mon["past_types"] if GENERATIONS.index(entry["generation"]["name"]) > 1]
            earliest = min(later, key=lambda entry: GENERATIONS.index(entry["generation"]["name"]), default=None)
            slots = earliest["types"] if earliest else mon["types"]
            profiles[dex] = {
                "types": [slot["type"]["name"].capitalize() for slot in sorted(slots, key=lambda slot: slot["slot"])],
                "moves": sorted(
                    {
                        entry["move"]["name"]
                        for entry in mon["moves"]
                        for detail in entry["version_group_details"]
                        if detail["version_group"]["name"] == "crystal"
                    }
                ),
            }
        return profiles

    @staticmethod
    def species_id(reference: dict) -> int:
        return int(reference["url"].rstrip("/").split("/")[-1])

    @staticmethod
    def evolution(detail: dict, into: int) -> dict:
        """Reduces a PokeAPI evolution detail to the trigger the game models: level-up, use-item, trade, or friendship."""
        trigger = detail["trigger"]["name"]
        if trigger == "level-up" and detail["min_happiness"] is not None:
            trigger = "friendship"
        item = detail["item"] or detail["held_item"]
        return {
            "into": into,
            "trigger": trigger,
            "min_level": detail["min_level"],
            "item": item["name"] if item else None,
        }

    def evolutions(self) -> dict[int, list[dict]]:
        """Maps each Pokémon id to the Gen 1-2 species it evolves into; later-generation targets are dropped."""
        species = self.fetch_all([f"pokemon-species/{dex}" for dex in range(1, 252)])
        chains = {self.species_id(mon["evolution_chain"]) for mon in species}
        found: dict[int, list[dict]] = {dex: [] for dex in range(1, 252)}
        for chain in self.fetch_all([f"evolution-chain/{number}" for number in sorted(chains)]):
            pending = [chain["chain"]]
            while pending:
                node = pending.pop()
                source = self.species_id(node["species"])
                for child in node["evolves_to"]:
                    into = self.species_id(child["species"])
                    if max(source, into) <= 251:
                        found[source].append(self.evolution(child["evolution_details"][0], into))
                    pending.append(child)
        return found

    def version_orders(self) -> dict[str, int]:
        names = [entry["name"] for entry in self.fetch("version-group?limit=100")["results"]]
        groups = self.fetch_all([f"version-group/{name}" for name in names])
        return {group["name"]: group["order"] for group in groups}

    @staticmethod
    def gen2_value(move: dict, field: str, orders: dict[str, int]):
        """Reads a field as Crystal had it: the earliest later `past_values` entry that sets it, else the current value."""
        later = [entry for entry in move["past_values"] if orders[entry["version_group"]["name"]] > orders["crystal"]]
        for entry in sorted(later, key=lambda item: orders[item["version_group"]["name"]]):
            if entry[field] is not None:
                return entry[field]
        return move[field]

    def moves(self) -> dict[str, dict]:
        catalog = {}
        orders = self.version_orders()
        for move in self.fetch_all([f"move/{dex}" for dex in range(1, 252)]):
            meta = move["meta"]
            kind = self.gen2_value(move, "type", orders)["name"].capitalize()
            damage_class = move["damage_class"]["name"]
            if damage_class != "status":
                damage_class = "physical" if kind in PHYSICAL_TYPES else "special" if kind in SPECIAL_TYPES else damage_class
            catalog[move["name"]] = {
                "name": move["name"],
                "display_name": next(entry["name"] for entry in move["names"] if entry["language"]["name"] == "en"),
                "type": kind,
                "damage_class": damage_class,
                "power": self.gen2_value(move, "power", orders),
                "accuracy": self.gen2_value(move, "accuracy", orders),
                "pp": self.gen2_value(move, "pp", orders),
                "priority": move["priority"],
                "effect_chance": move["effect_chance"],
                "stat_changes": [
                    {"stat": change["stat"]["name"], "change": change["change"]} for change in move["stat_changes"]
                ],
                "meta": {
                    "category": meta["category"]["name"],
                    "ailment": meta["ailment"]["name"],
                    "ailment_chance": meta["ailment_chance"],
                    "flinch_chance": meta["flinch_chance"],
                    "stat_chance": meta["stat_chance"],
                    "drain": meta["drain"],
                    "healing": meta["healing"],
                    "crit_rate": meta["crit_rate"],
                    "min_hits": meta["min_hits"],
                    "max_hits": meta["max_hits"],
                },
            }
        return catalog

    def types(self) -> dict[str, dict[str, float]]:
        """Maps attacker to defender to a multiplier, listing only the pairs that are not 1."""
        chart = {}
        for kind in self.fetch_all([f"type/{name.lower()}" for name in TYPES]):
            # Gen 6 changed Steel, Ghost, and Dark; the generation-v entry holds the Gen 2-5 relations.
            past = {entry["generation"]["name"]: entry["damage_relations"] for entry in kind["past_damage_relations"]}
            relations = past.get("generation-v", kind["damage_relations"])
            row = {}
            for key, multiplier in (("no_damage_to", 0), ("half_damage_to", 0.5), ("double_damage_to", 2)):
                for target in relations[key]:
                    if target["name"].capitalize() in TYPES:
                        row[target["name"].capitalize()] = multiplier
            chart[kind["name"].capitalize()] = row
        return chart


if __name__ == "__main__":
    scraper = PokedexScraper()
    entries = scraper.parse(scraper.fetch())
    api = PokeApiScraper()
    profiles = api.profiles()
    evolutions = api.evolutions()
    for entry in entries:
        entry["types"] = profiles[entry["id"]]["types"]
        entry["moves"] = profiles[entry["id"]]["moves"]
        entry["evolutions"] = sorted(evolutions[entry["id"]], key=lambda step: step["into"])
    scraper.save(entries, api.moves(), api.types())
    print(f"Saved {len(entries)} Pokémon to pokemon_gen1_2.json and pokemon_gen1_2.js")

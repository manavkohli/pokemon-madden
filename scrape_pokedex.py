#!/usr/bin/env python3
"""Refresh the Gen I–II roster from Pokémon Database's main Pokédex table."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = "https://pokemondb.net/pokedex/all"
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

    def save(self, entries: list[dict]) -> None:
        data = {"source": SOURCE, "pokemon": entries}
        (ROOT / "pokemon_gen1_2.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (ROOT / "pokemon_gen1_2.js").write_text("window.POKEMON_DATA = " + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    scraper = PokedexScraper()
    entries = scraper.parse(scraper.fetch())
    scraper.save(entries)
    print(f"Saved {len(entries)} Pokémon to pokemon_gen1_2.json and pokemon_gen1_2.js")

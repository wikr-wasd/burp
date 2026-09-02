# AGENTS.md

Reglerna för det här repot står i **[`CLAUDE.md`](CLAUDE.md)**. Läs den först,
och hela.

Den här filen är en pekare och ingenting annat. Innehållet står på **ett** ställe
med flit: två regelverk glider isär, och den som läser det inaktuella bygger fel
sak med full övertygelse. Precis den sortens andra kopia är ett återkommande
fel i det här projektet — personalhanteringen låg på två ställen tills den ena
skrev förbi `invite_staff()`, och avgiftslogiken har samma krav på sig.

Det snabbaste sättet in, i ordning:

| Fil | Varför |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Reglerna som inte får brytas, och fällorna som redan kostat tid |
| [`docs/TODO.md`](docs/TODO.md) | Arbetslistan. Följ den uppifrån |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Systemet, med det som ändrats sedan v0.1 först |
| [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md) | Beslut som blockerar. Svaren skrivs in i dokumentet |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Förtroendegränserna, och vad RLS inte kan |

Innan något kallas klart:

```bash
npm run db:validate && npm run type-check && npm run lint && npm run test && npm run build
```

Och med Docker igång: `npm run db:verify` samt `bash scripts/smoke.sh`.
Röktestet är det som avgör om något faktiskt fungerar.

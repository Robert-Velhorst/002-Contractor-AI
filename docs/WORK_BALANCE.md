# Werkbalans en resterend werk

De werkbalans verbindt een goedgekeurde productiegrondslag met de werkpakketten,
de vastgelegde uitvoering en de posities die uitvoerenden kunnen kiezen. Het
doel is een controleerbaar antwoord op drie vragen: wat is oorspronkelijk
afgesproken, wat is aantoonbaar uitgevoerd en welk werk resteert per pakket?

## Werkwijze

1. Een bevoegde medewerker legt per productieregel de bron, omvang en
   onderbouwing vast. Alle hoeveelheden uit de goedgekeurde grondslag moeten
   precies eenmaal en tot op vier decimalen over geldige, actieve werkpakketten
   worden verdeeld.
2. De verdeling wordt een onveranderlijke, versiegebonden beoordelingsaanvraag.
   Een bevoegde beoordelaar keurt deze afzonderlijk goed of wijst haar af.
   Een wijziging van de grondslag of werkpakketten maakt een oude aanvraag
   ongeldig; er wordt niets automatisch opnieuw goedgekeurd.
3. Geregistreerde productiemetingen verminderen het resterende werk alleen als
   zij geldig zijn en aan een actuele, behouden deeloplevering zijn toegerekend.
   Een open correctie, te hoge hoeveelheid, ontbrekende toerekening, gewijzigde
   eenheid of ingetrokken deeloplevering vraagt eerst om afstemming.
4. De werkkaart voor uitvoerenden toont alleen de toegestane pakketregels,
   gemelde, resterende en extra hoeveelheden. Bronverwijzingen, klantgegevens en
   kantoorbeoordelingen blijven buiten dit veldscherm.
5. Publicatie van een nieuwe positie wordt geblokkeerd wanneer de bron, verdeling,
   taken, metingen of toerekening niet actueel zijn. De pakketbasis wordt bij
   publicatie opnieuw berekend; een eerder opgestelde uitnodiging geldt niet als
   bewijs dat het werk nog beschikbaar is.

Resterende richturen zijn een verhouding van de goedgekeurde uren en resterende
hoeveelheid. Zij zijn nadrukkelijk geen rooster, toezegging of haalbaarheidsbewijs.
Een pakket zonder meetbare productieregel kan alleen als taakpakket lopen wanneer
de bijbehorende taken bewust in de goedgekeurde pakketverdeling zijn opgenomen.

## API en beheer

- `GET /api/ledger/jobs/:jobId/work-balance` geeft de kantoorweergave, bronstatus,
  verdeling, uitvoering en resterende hoeveelheden terug.
- `POST /api/ledger/jobs/:jobId/work-balance` maakt met een bronhash en
  idempotentiesleutel een beoordelingsaanvraag. De route verstuurt geen bericht,
  plant geen uitvoerende in en doet geen bestelling of financiële boeking.
- Goedkeuring verloopt via de bestaande rolgebonden goedkeuringsroute.
- De veldwerkkaart ontvangt een beperkte `balance`-projectie. De operationele
  export bevat de volledige plannen en idempotente commandoreceipts.
- SQLite en PostgreSQL krijgen dezelfde versiegebonden migratie, integriteits-
  en backupcontrole. De Windows- en containerpakketten bevatten dezelfde module
  en dit document.

De autoritatieve opslag bestaat uit `work_balance_plans` en
`work_balance_commands`. Elke goedgekeurde versie bewaart een controlesom,
grondslaghash, totale scope, werkpakketregels en goedkeuringskoppeling. Historie
wordt vervangen noch stilzwijgend herschreven. De native
company-authority-beveiliging beschermt beide tabellen.

## Grenzen

De werkbalans is geen contractinterpretatie en leidt geen ontbrekende hoeveelheid
af uit tekst, tekeningen of foto's. Zij plant geen mensen, lost geen
beschikbaarheidsconflicten op, bestelt geen materialen en voorspelt geen datum.
Verbruik, afval, meerwerk, wijzigingen, afwijkende eenheden en deelopleveringen
vereisen hun eigen geregistreerde besluit- en bewijsroute. Bij twijfel blokkeert
de actuele positiepublicatie totdat kantoor de bronnen en correcties heeft
afgestemd. Dit is ledger- en broncontrole, geen live AI-inspectie.

## Verificatie

`tests/work-balance.test.js` test exacte hoeveelheidsverdeling, goedkeuring,
bronwijzigingen, uitvoeringstoerekening, veldprivacy, onveranderlijke
integriteitscontrole en backupvalidatie. `tests/work-balance-api.test.js` test
authenticatie, rollen, API- en exportgrenzen. De frontendtest controleert de
indienflow, exacte retry en veilige tekstrendering. Productie- en providerclaims
vereisen afzonderlijke acceptatie; tests met lokale fixtures bewijzen die niet.

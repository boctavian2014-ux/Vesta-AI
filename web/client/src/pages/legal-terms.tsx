import { LegalPageShell } from "@/components/legal-page-shell";

export default function LegalTermsPage() {
  return (
    <LegalPageShell title="Termeni și condiții de utilizare">
      <h2>1. Operator</h2>
      <p>
        Serviciile disponibile prin aplicația Vesta AI sunt furnizate de operatorul platformei („noi” /
        „Vesta”). Datele de identificare completă ale entității juridice trebuie completate aici înainte
        de publicare.
      </p>

      <h2>2. Descrierea serviciilor</h2>
      <p>
        Platforma oferă instrumente de analiză și informare privind imobile (ex. date cadastrale,
        tendințe de piață) și poate include opțiuni de comandă a unor documente sau rapoarte
        (inclusiv Nota Simple și rapoarte generate cu sprijin AI), în măsura în care acestea sunt
        disponibile în interfață.
      </p>
      <p>
        Anumite livrări depind de terți (ex. registru, colaboratori autorizați, furnizori de date).
        Termenele și disponibilitatea pot varia; nu garantăm un rezultat anume în afara obligațiilor
        legale aplicabile.
      </p>

      <h2>3. Cont și acces</h2>
      <p>
        Crearea unui cont poate fi necesară pentru funcții salvate și plăți. Sunteți responsabil de
        confidențialitatea autentificării și de exactitatea datelor furnizate.
      </p>

      <h2>4. Plăți</h2>
      <p>
        Plățile se pot procesa prin furnizori terți (ex. Stripe). Prețurile afișate sunt cele în vigoare
        la momentul comenzii. Facturarea și TVA-ul (dacă e cazul) se reglementează conform legislației
        aplicabile și politicii operatorului.
      </p>

      <h2>5. Rambursări și întârzieri</h2>
      <p>
        Condițiile de anulare, drept de retragere (unde aplicabil consumatorilor) și rambursare se
        stabilesc conform legii aplicabile și vor fi detaliate în versiunea finală a acestui document.
        Întârzieri cauzate de terți (registru, curieri electronici) pot apărea; veți fi informați rezonabil
        despre statusul comenzii în măsura posibilităților tehnice.
      </p>

      <h2>6. Limitarea răspunderii</h2>
      <p>
        Informațiile și rapoartele au caracter informativ și nu înlocuiesc sfatul juridic, fiscal sau de
        investiții. În măsura permisă de lege, excludem anumite daune indirecte sau consecințiale.
      </p>

      <h2>7. Modificări</h2>
      <p>
        Putem actualiza acești termeni; versiunea în vigoare este cea publicată în aplicație, cu data
        ultimei actualizări (de adăugat).
      </p>

      <h2>8. Contact</h2>
      <p>Adăugați aici email și, opțional, adresă poștală pentru solicitări legate de termeni.</p>
    </LegalPageShell>
  );
}

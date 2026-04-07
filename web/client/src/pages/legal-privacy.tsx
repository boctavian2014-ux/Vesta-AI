import { LegalPageShell } from "@/components/legal-page-shell";

export default function LegalPrivacyPage() {
  return (
    <LegalPageShell title="Politica de confidențialitate">
      <h2>1. Operatorul datelor</h2>
      <p>
        Operatorul care prelucrează datele personale prin Vesta AI trebuie identificat complet aici
        (denumire, adresă, contact DPO sau persoană desemnată, dacă e cazul).
      </p>

      <h2>2. Ce date colectăm</h2>
      <ul>
        <li>Date de cont: ex. nume utilizator, adresă de email, parolă (stocată în formă securizată).</li>
        <li>Date de utilizare: ex. proprietăți salvate, comenzi, conținut necesar generării rapoartelor.</li>
        <li>Date de plată: procesate de procesatorul de plăți (ex. Stripe); nu stocăm în mod curent
          numărul complet al cardului pe serverele noastre.</li>
        <li>Date tehnice: ex. jurnale minimale necesare securității și funcționării serviciului.</li>
      </ul>

      <h2>3. Scopuri și temeiuri</h2>
      <p>
        Prelucrăm datele pentru executarea contractului cu dvs., interese legitime (securitate,
        îmbunătățirea serviciului) și, unde e necesar, consimțământ (ex. comunicări de marketing, dacă
        există).
      </p>

      <h2>4. Destinatari și transferuri</h2>
      <p>
        Putem împărtăși date cu furnizori care ne prestează servicii (găzduire, plată, email, analiză
        AI), în limitele contractelor și legii. Unii furnizori pot fi în afara SEE; în acest caz se vor
        aplica garanții adecvate (ex. clauze contractuale standard).
      </p>

      <h2>5. Durata păstrării</h2>
      <p>
        Păstrăm datele cât timp este necesar pentru scopurile de mai sus și conform obligațiilor legale
        (ex. contabilitate).
      </p>

      <h2>6. Drepturile dvs. (RGPD)</h2>
      <p>
        Aveți dreptul de acces, rectificare, ștergere, restricționare, opoziție și portabilitate, în
        condițiile legii. Pentru exercitare, contactați operatorul. Aveți dreptul să depuneți plângere la
        autoritatea de supraveghere (ex. ANSPDCP în România sau autoritatea din țara dvs. de
        reședință).
      </p>

      <h2>7. Securitate</h2>
      <p>
        Implementăm măsuri tehnice și organizatorice rezonabile; niciun sistem nu este însă 100% sigur.
      </p>

      <h2>8. Modificări</h2>
      <p>
        Vom actualiza această politică când este necesar; vă vom informa prin mijloace rezonabile dacă
        legea o cere.
      </p>
    </LegalPageShell>
  );
}

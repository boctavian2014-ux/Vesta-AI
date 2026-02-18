"""Adaugă coloane noi la properties și detailed_reports. Rulează: python migrate_add_scor.py"""
import sqlite3
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
path = "imobiliare.db"
if not os.path.exists(path):
    print("imobiliare.db nu există; va fi creat la pornirea backend-ului.")
    exit(0)

conn = sqlite3.connect(path)
cur = conn.cursor()

# --- properties ---
cur.execute("PRAGMA table_info(properties)")
cols = [r[1] for r in cur.fetchall()]
if "scor_oportunitate" not in cols:
    cur.execute("ALTER TABLE properties ADD COLUMN scor_oportunitate INTEGER")
    conn.commit()
    print("Coloană scor_oportunitate adăugată.")
else:
    print("Coloana scor_oportunitate există deja.")
if "stare_piscina" not in cols:
    cur.execute("ALTER TABLE properties ADD COLUMN stare_piscina VARCHAR")
    conn.commit()
    print("Coloană stare_piscina adăugată.")
else:
    print("Coloana stare_piscina există deja.")

# --- detailed_reports: stripe_session_id (idempotență webhook) ---
cur.execute("PRAGMA table_info(detailed_reports)")
cols_dr = [r[1] for r in cur.fetchall()]
if "stripe_session_id" not in cols_dr:
    cur.execute("ALTER TABLE detailed_reports ADD COLUMN stripe_session_id VARCHAR")
    conn.commit()
    print("Coloană detailed_reports.stripe_session_id adăugată.")
else:
    print("Coloana stripe_session_id există deja.")
if "cargas_resumen" not in cols_dr:
    cur.execute("ALTER TABLE detailed_reports ADD COLUMN cargas_resumen VARCHAR")
    conn.commit()
    print("Coloană detailed_reports.cargas_resumen adăugată.")
else:
    print("Coloana cargas_resumen există deja.")
conn.close()

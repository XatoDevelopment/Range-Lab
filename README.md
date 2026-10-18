RangeLab Suite

Open-source poker analysis suite. Runs on your own server with Python and Flask, and is used from the browser on PC and mobile (also installable as an app).

## Tools

- **Equity Lab**: equity calculation between hands and ranges.
- **Preflop Lab**: preflop range and decision study.
- **Bankroll Lab**: bankroll, session, and results tracking.
- **Hand Lab**: hand import, review, and analysis.
- **Range Lab**: range analyzer.
- **MTT Exploiter**: multi-table tournament analysis and exploitation.
- **AI Table**: practice table against AI-controlled opponents, calibrated with your Hand Lab stats.
- **Tournament Lab**: tournament calculator.

## Quick Start

Requirements: Python 3.10 or higher.

```bash
pip install -r requirements.txt
python app.py
```

Then open http://localhost:5000. The first visit opens the setup wizard (/setup), where the admin account is created. The wizard asks for an installation token displayed in the server console on startup.

You can also use start.sh / start.bat, or Docker (docker compose up -d). See DEPLOY.md for server installation, HTTPS, and maintenance.

Environment Variables

Variable Usage
RANGELAB_PORT Server port (default 5000)
RANGELAB_DB_PATH Path to the SQLite file (default data/rangelab.db)
RANGELAB_HTTPS 1 to enable secure cookie behind HTTPS
RANGELAB_TRUST_PROXY 1 if the server is behind a reverse proxy (Nginx, Caddy): uses the real client IP
RANGELAB_SECRET_KEY Session key (optional; if not set, it is generated and stored on the server)

Data and Privacy

User data (database, keys, and backups) is stored locally in data/ and backups/. These folders are excluded from the repository and should never be uploaded to GitHub.

Development

```bash
pip install -r requirements.txt
python -m unittest discover -s tests -v
```

To contribute, read CONTRIBUTING.md. Version changes and history are in CHANGELOG.md. To report a security vulnerability, follow the instructions in SECURITY.md instead of opening a public issue.

Structure

```
app.py              Flask server (routes, API, database)
templates/          HTML templates for each tool
static/             CSS, JavaScript, icons, and service worker (PWA)
scripts/            Utilities: backups and admin password reset
tests/              Smoke tests
```

Contributing

Contributions are welcome: open an issue to report bugs or suggest improvements, and a pull request with the changes. Keep the existing code style and test your change before submitting it.

Donations

RangeLab is free. If you find it useful and want to support its development, you can make a voluntary donation. Donations are not required to use the software.

Developer

RangeLab is developed by XatoDev · contact: xatodev.contacto@gmail.com

License

Distributed under the RangeLab Non-Commercial License (see LICENSE). You can freely use, modify, and share the software for non-commercial purposes. Selling it, charging for it, or integrating it into paid products or services is not permitted without prior agreement with the author.

Third-party libraries retain their own license; see THIRD_PARTY_NOTICES.md.
# smcs-schedule

SMCS schedule site with a GitHub Pages front end.

## GitHub Pages

Publish the `docs/` folder as the Pages source.

- Public homepage: `/`
- Admin editor: `/admin/`
- Admin login: `charles` / `SMCS`
- Weekly schedule data is stored in the browser for the Pages build, so changes are local to that browser unless you export the JSON and publish the updated file

## Local Spring Boot

The original Spring Boot backend is still present under `src/main/java`, and the app can still be run locally with Maven if you want the server-based version.

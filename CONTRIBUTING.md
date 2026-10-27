# Guía de contribución: HospitalUnicaes

Estas convenciones aplican a los cuatro repositorios del proyecto
(`HospitalUnicaes-Api`, `HospitalUnicaes-Web`, `HospitalUnicaes-Mobile-Android`, `HospitalUnicaes-Mobile-IOS`).

## Ramas permanentes

| Rama | Ambiente | Se actualiza desde |
|---|---|---|
| `prod` | Producción (lo que se presenta al docente) | `staging`, por Pull Request |
| `staging` | Pruebas e integración entre plataformas | `development`, por Pull Request |
| `development` | Desarrollo: aquí se integra todo el trabajo diario | ramas de tarea, por Pull Request |

Nunca se hace push directo a `prod`, `staging` ni `development`.

## Ramas de tarea

Cada tarea de Jira se trabaja en su propia rama, creada desde `development`:

```
HUNI-<número>-<titulo-de-la-tarea-en-kebab-case>
```

Ejemplos:

```
HUNI-15-repositorios-github
HUNI-19-scaffold-ios-swiftui-mvvm
HUNI-28-diseno-pantallas-ios
```

Reglas del nombre:
- La clave del ticket va primero y en mayúsculas (`HUNI-15`), así Jira vincula la rama automáticamente.
- El resto es el título del ticket en minúsculas, sin tildes ni `ñ`, con palabras separadas por guiones.
- Corto: de 3 a 6 palabras.

## Flujo de trabajo

1. `git checkout development && git pull`
2. `git checkout -b HUNI-<n>-<titulo>`
3. Commits pequeños (ver abajo) y `git push -u origin HUNI-<n>-<titulo>`
4. Abrir un Pull Request **hacia `development`** usando la plantilla.
5. Al menos 1 revisión aprobada antes de hacer merge.
6. Cuando `development` está estable se promueve a `staging` y, tras probar, a `prod`.

Toda tarea se mergea **primero a `development`**. Nunca se abre un PR de una rama de tarea directo a `staging` o `prod`.

## Mensajes de commit

Formato [Conventional Commits](https://www.conventionalcommits.org/es/) con la clave del ticket como alcance:

```
<tipo>(HUNI-<n>): <descripción en imperativo>
```

Ejemplos:

```
feat(HUNI-42): agregar endpoint de asignacion de camas
fix(HUNI-51): evitar doble despacho de ambulancia
chore(HUNI-15): configurar plantilla de pull request
```

Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`.

Los commits no llevan trailers `Co-Authored-By` de herramientas de IA.

## Secretos

- Nunca subir `.env`, llaves de Supabase con rol de servicio, `local.properties` ni `*.xcconfig` locales.
- Cada repo incluye un archivo de ejemplo (`.env.example`, `.env.template`, `Secrets.example.xcconfig`, etc.) con los nombres de las variables.

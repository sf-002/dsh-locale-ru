# dsh-locale-ru — русская локализация DeepSeek Harness

Неофициальный языковой пакет для веб-интерфейса [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Переведено **2605 строк в 57 пространствах имён** — практически весь UI: чат, настройки,
боковая панель, плагины, расписания, файлы, терминал, цели, субагенты, рабочие процессы.

Реализовано как обычный клиентский плагин DSH: он регистрирует язык `ru`
(fallback `en`) и по одному словарю на каждое пространство имён через сервис
`locale`. `app.asar` не изменяется, целостность установки и автообновление
приложения не затрагиваются.

## Установка

Пакет ставится в профиль DSH (например, `desktop`) как bundle. Сборка лежит в
каталоге [`dist/dsh-locale-ru`](dist/dsh-locale-ru).

### Вариант 1. Скриптом

```powershell
git clone https://github.com/sf-002/dsh-locale-ru.git
cd dsh-locale-ru
node tools/deploy-locale-pack.mjs --profile "$env:USERPROFILE\.dsh\profiles\desktop"
```

Скрипт копирует пакет в `$DSH_HOME/plugins/dsh-locale-ru` и в
`node_modules` профиля, добавляет зависимость `file:` и имя пакета в
`dsh.profile.bundles` в `package.json` профиля, а также убирает
ручную вставку строки `locale-ru` из `cordis.patch.yml`, если она там была.

### Вариант 2. Через GUI

Боковая панель → **Plugins → Add plugin** → абсолютный путь к
`dist/dsh-locale-ru` → **Install** → **Enable now**. Профиль пересобирается
на лету, перезапуск приложения не нужен.

### Вариант 3. Через CLI

```powershell
& "C:\Users\<вы>\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add "file:<путь>\dsh-locale-ru\dist\dsh-locale-ru"
```

CLI-команда требует полностью закрытого приложения (профиль `desktop`
блокирует запись, пока работает Electron).

### Включение языка

1. Обновите страницу GUI (F5) — язык выбирается автоматически, если браузер
   (или Electron с `--lang=ru`) сообщает `ru`.
2. Вручную: **Настройки → Общие → Язык → Русский**.
3. Чтобы русский был по умолчанию, добавьте в `cordis.patch.yml` профиля:

```yaml
- id: locale
  name: "@deepseek-ai/dsh-client-locale"
  config:
    preference: ru
```

## Удаление

Уберите `@local/dsh-locale-ru` из `dsh.profile.bundles` и `dependencies` в
`package.json` профиля, удалите каталог пакета из `node_modules` профиля и
`$DSH_HOME/plugins`, затем перезапустите приложение.

## Структура репозитория

| Путь | Что там |
|---|---|
| `dist/dsh-locale-ru` | готовая сборка плагина (`package.json`, `cordis.patch.yml`, `lib/index.js`, `lib/client.js`) |
| `work/i18n/ru/batch-*.json` | переводы — источник правды, 18 файлов |
| `work/i18n/dictionaries.json` | английские строки и ключи, извлечённые из `app.asar` |
| `work/i18n/in/batch-*.json` | те же строки, нарезанные на партии для перевода |
| `work/i18n/verify-*.tsv` | отчёты проверок (совпадение ключей, плейсхолдеры, оставшийся английский) |
| `tools/*.mjs` | извлечение строк, сборка, установка, проверки |

## Обновление переводов

```powershell
# 1. извлечь актуальные строки из установленного приложения
node tools/extract-i18n.mjs          # -> work/i18n/dictionaries.json
node tools/make-batches.mjs          # -> work/i18n/in/batch-NN.json
# 2. отредактировать work/i18n/ru/batch-NN.json
# 3. собрать и установить
node tools/build-locale-pack.mjs --out dist/dsh-locale-ru
node tools/deploy-locale-pack.mjs --profile "$env:USERPROFILE\.dsh\profiles\desktop"
```

Проверки: `tools/verify-translations.mjs` (ключи, плейсхолдеры, пустые строки),
`tools/verify-english-left.mjs` (непереведённый английский),
`tools/test-client-bundle.mjs` (загружает собранный плагин так же, как браузер).

После замены файлов уже загруженного плагина нужен перезапуск приложения: DSH
не следит за содержимым `node_modules`.

## Совместимость и ограничения

* Проверено на DeepSeek Harness **0.2.0-rc.2**. Ключи строк привязаны к версии:
  при обновлении приложения запустите извлечение заново и проверьте
  `tools/verify-translations.mjs` — он сообщит о пропавших и лишних ключах.
* Пакет называется `@local/dsh-locale-ru` — это локальное имя, под которым он
  ставится в профиль. Для публикации в npm переименуйте его (например, в
  `dsh-locale-ru` или `@<ваш-ник>/dsh-locale-ru`) в
  `tools/build-locale-pack.mjs`.
* Намеренно не переводятся: имена продуктов и приложений (DeepSeek Harness,
  VS Code, Cursor, GitHub Desktop…), технические токены (JSON, PDF, HTTP, TTFT,
  UTC, px), разделители списков, шаблоны вида `{m}/{d}`, названия слэш-команд
  (`goal`, `plan`, `compact` — вводятся латиницей), идентификаторы локалей.
* Формат дат расписания переведён на `ru`, разделитель групп разрядов —
  неразрывный пробел.

## Лицензия и правовой статус

Проект распространяется под [MIT](LICENSE). Русские строки — производная работа
от английских строк DeepSeek Harness
([MIT, Copyright (c) 2026 DeepSeek](https://github.com/deepseek-ai/deepseek-harness)),
уведомление об авторских правах сохранено; подробности — в [NOTICE](NOTICE).

Проект **не связан с DeepSeek** и не является официальным переводом. Названия и
товарные знаки принадлежат их владельцам; логотипы и ресурсы приложения здесь не
распространяются.

---

### English summary

Unofficial Russian language pack for the DeepSeek Harness web GUI (2605 strings,
57 namespaces), shipped as a regular DSH client plugin/bundle. It registers the
`ru` locale with `en` as fallback and does not modify `app.asar`.

Install: `node tools/deploy-locale-pack.mjs --profile <profile dir>`, or use the
GUI's **Plugins → Add plugin** with the `dist/dsh-locale-ru` path, or
`dsh plugin --profile <name> add file:<path>`. Then pick **Русский** in
Settings → General, or set `config.preference: ru` on the `locale` row.

MIT licensed; the translated strings are a derivative work of DeepSeek Harness
(MIT, Copyright (c) 2026 DeepSeek). Not affiliated with or endorsed by DeepSeek.

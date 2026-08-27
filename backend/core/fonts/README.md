# Fonts vendored for the PDF report

`LiberationSans-Regular.ttf` and `LiberationSans-Bold.ttf`, from Debian's
`fonts-liberation` package, under the **SIL Open Font License 1.1**.

They are committed rather than installed because the PDF is rendered inside the
container, and `python:3.12-slim` ships no fonts at all. ReportLab's own bundled
Vera covers Latin-1 only — it has no `ą ę ń ś ź ż`, so a Polish report rendered
with it comes out full of blanks (`core/tests/test_report_pdf.py` pins that the
font actually in use does cover them).

Liberation rather than DejaVu: the same coverage in 826 kB instead of 1.5 MB,
which is worth something in a repository that otherwise holds no binaries.

To update, copy them out of `fonts-liberation` again — there is no build step.

FROM python:3.12-slim

WORKDIR /Mediculus_App

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

RUN useradd --no-create-home django \
    && chown -R django:django /Mediculus_App
USER django

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--access-logfile", "-", "--error-logfile", "-", "--log-level", "debug", "--timeout", "60"]
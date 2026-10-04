FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY notify.py .

# uid 1000 is the Pi's first user, so a key that is chmod 600 for that user is still readable here.
RUN useradd --uid 1000 --create-home notifier
USER notifier

CMD ["python", "notify.py"]

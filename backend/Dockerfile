FROM python:3.13-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# The container runs as root only so the sandbox can drop each strategy
# process to the unprivileged "nobody" user; the API itself has no secrets.
ENV HOST=0.0.0.0 PORT=8000
EXPOSE 8000
CMD ["python", "-m", "app.main"]

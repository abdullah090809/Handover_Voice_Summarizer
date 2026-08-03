import random
from locust import HttpUser, task, between


class HandoverUser(HttpUser):
    # Simulated think time between user actions (1-5 seconds)
    wait_time = between(1, 5)

    def on_start(self):
        """Executed when a simulated user starts. Performs login/setup."""
        self.username = f"worker_{random.randint(1000, 9999)}"
        self.email = f"{self.username}@example.com"
        self.password = "SecurePassword123!"
        self.token = None
        self.headers = {}

        # 1. Register
        with self.client.post(
            "/auth/register",
            json={
                "email": self.email,
                "username": self.username,
                "password": self.password,
            },
            catch_response=True,
        ) as response:
            if response.status_code in (200, 201):
                response.success()
            else:
                response.failure(f"Registration failed: {response.text}")

        # 2. Login (obtain token)
        with self.client.post(
            "/auth/login",
            data={
                "username": self.email,  # Username field typically accepts email/username
                "password": self.password,
            },
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                self.token = response.json().get("access_token")
                self.headers = {"Authorization": f"Bearer {self.token}"}
                response.success()
            else:
                response.failure(f"Login failed: {response.text}")

    @task(5)
    def view_handovers(self):
        """Simulate viewing the paginated handover notes feed."""
        if not self.headers:
            return
        self.client.get(
            "/handover/?limit=10&skip=0",
            headers=self.headers,
            name="/handover/ (list)",
        )

    @task(2)
    def get_residents(self):
        """Simulate fetching active residents list."""
        if not self.headers:
            return
        self.client.get(
            "/residents/",
            headers=self.headers,
            name="/residents/",
        )

    @task(1)
    def check_health(self):
        """Simulate system health checks."""
        self.client.get("/health/db", name="/health/db")
        self.client.get("/health/redis", name="/health/redis")

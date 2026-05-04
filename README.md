# Employee Time Tracker


A minimal employee time-tracking web app built with **HTML/CSS** on the frontend and **Node.js + Express** on the backend, backed by **PostgreSQL** made for a company I used to work at and used as a learning exercise for PostgreSQL and JavaScript. This was my first time experimenting with Claude code.

## Features

- Add and list employees with editable hourly rate
- Clock in / clock out with optional notes
- Live current-status indicator per employee
- Recent time-entry history with computed durations
- Export a 2-week pay period to an `.xlsx` workbook (Pay Summary + Time Entries sheets)

## Setup

1. **Install dependencies**

   ```bash
   cd employee-time-tracker
   npm install
   ```

2. **Create the PostgreSQL database**

   ```bash
   createdb employee_time_tracker
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   # edit .env so DATABASE_URL points at your Postgres instance
   ```

4. **Initialize the schema**

   ```bash
   npm run init-db
   ```

5. **Run the server**

   ```bash
   npm start
   ```

   Then open http://localhost:3000 in your browser.

## API

| Method | Path                                     | Description                      |
| ------ | ---------------------------------------- | -------------------------------- |
| GET    | `/api/employees`                         | List employees                                         |
| POST   | `/api/employees`                         | Create employee `{name,email,role,hourly_rate}`        |
| PATCH  | `/api/employees/:id`                     | Update `{hourly_rate}`                                 |
| DELETE | `/api/employees/:id`                     | Delete employee                                        |
| GET    | `/api/time-entries?employee_id=&limit=`  | List recent time entries                               |
| GET    | `/api/time-entries/active/:employeeId`   | Current open entry, if any                             |
| POST   | `/api/time-entries/clock-in`             | Clock in `{employee_id,note?}`                         |
| POST   | `/api/time-entries/clock-out`            | Clock out `{employee_id}`                              |
| GET    | `/api/payroll/preview?start=YYYY-MM-DD`  | JSON pay summary for the 14-day window starting `start` |
| GET    | `/api/payroll/export?start=YYYY-MM-DD`   | Download `.xlsx` pay report for that 14-day window     |

> **Note:** if you initialized the database before this update, rerun `npm run init-db` so the `hourly_rate` column gets added.


To start server: sudo systemctl start postgresql, systemctl enable --now postgresql (for on system start server launch)

to end server: (in terminal where server is running ctrl + C) out of server (pkill -f "node server.js")
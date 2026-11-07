-- AITU Student Success Radar — Stage 2 data analysis (End-term Part C).
-- Data: CSV files from Teacher Portal → Administration → Backups → "Prepare CSV" (synthetic test data).
-- Run: npm run analysis            (loads analysis/data/*.csv into SQLite in memory and runs every query below)
--      npm run analysis -- <folder> (your own fresh export)
-- Change the grouping: edit GROUP BY (e.g. weekday → hour, course → "group") and run again.

-- Q1. On which weekday are students absent most often?
-- Denominator = present + late + absent (excused and unmarked are not attendance failures) — same rule as the admin panel.
SELECT weekday,
       COUNT(*)                                        AS marked,
       SUM(status = 'absent')                          AS absent,
       ROUND(100.0 * SUM(status = 'absent') / COUNT(*), 1) AS absent_pct
FROM attendance
WHERE status IN ('present', 'late', 'absent')
GROUP BY weekday
ORDER BY CASE weekday WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3 WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 ELSE 6 END;

-- Q1 (extra). Late arrivals by class start hour (Astana time), among students who came.
SELECT hour,
       COUNT(*)                                       AS attended,
       SUM(status = 'late')                           AS late,
       ROUND(100.0 * SUM(status = 'late') / COUNT(*), 1) AS late_pct
FROM attendance
WHERE status IN ('present', 'late')
GROUP BY hour
ORDER BY hour;

-- Q2. Which type of work has the weakest results and the most missing submissions?
-- Average over GRADED records only: "not graded yet" is not 0.
SELECT category,
       COUNT(*)                                                         AS records,
       ROUND(AVG(CASE WHEN grade_state = 'graded' THEN CAST(percent AS REAL) END), 1) AS avg_result_pct,
       SUM(submission = 'missing')                                      AS missing,
       ROUND(100.0 * SUM(submission = 'missing') / COUNT(*), 1)         AS missing_pct
FROM grades
GROUP BY category
ORDER BY avg_result_pct;

-- Q3. In which courses are the most students at risk?
SELECT course,
       SUM(risk = 'high')    AS high,
       SUM(risk = 'medium')  AS medium,
       SUM(risk = 'low')     AS low,
       SUM(risk = 'unknown') AS not_enough_data,
       COUNT(*)              AS students,
       ROUND(100.0 * SUM(risk IN ('high', 'medium')) / COUNT(*), 1) AS at_risk_pct
FROM risk
GROUP BY course
ORDER BY at_risk_pct DESC;

-- Q3 (why). How often each risk reason appears (one row = one student in one course).
SELECT 'SCHOLARSHIP_RISK' AS reason, SUM(reasons LIKE '%SCHOLARSHIP_RISK%') AS rows_with_reason FROM risk
UNION ALL SELECT 'ATTENDANCE_LOW', SUM(reasons LIKE '%ATTENDANCE_LOW%') FROM risk
UNION ALL SELECT 'ADMISSION_RISK', SUM(reasons LIKE '%ADMISSION_RISK%') FROM risk
UNION ALL SELECT 'OVERDUE_WORK',   SUM(reasons LIKE '%OVERDUE_WORK%') FROM risk
ORDER BY rows_with_reason DESC;

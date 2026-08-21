import re

with open('src/components/DashboardClient.tsx', 'r') as f:
    content = f.read()

content = content.replace('data[0].date', "data[0]['Дата']")
content = content.replace('data[data.length - 1].date', "data[data.length - 1]['Дата']")
content = content.replace('row.date', "row['Дата']")
content = content.replace('curr.date', "curr['Дата']")
content = content.replace('a.date', "a['Дата']")
content = content.replace('b.date', "b['Дата']")
content = content.replace('r.date', "r['Дата']")
content = content.replace('{ date: row[\'Дата\']', "{ 'Дата': row['Дата']")
content = content.replace('d.seller_name', "d.name")
content = content.replace('r.seller_name', "r.name")

with open('src/components/DashboardClient.tsx', 'w') as f:
    f.write(content)


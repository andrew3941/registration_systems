const payload = {
  firstName: 'Abdul',
  middleName: 'S',
  lastName: 'Kamara',
  dob: '1989-08-25',
  sex: 'Male',
  nationality: 'Sierra Leonean',
  phone: '+233240000099',
  email: 'abdul.kamara@example.com',
  address: 'Bombali Street',
  district: 'Bombali',
  ward: '009',
  region: 'North',
  centre: 'Central Office 04',
  documentType: 'National identity card',
  documentNumber: 'SL-1989-ABK-001'
};

async function main() {
  const duplicate = await fetch('http://localhost:3000/api/applications/check-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': '2', 'X-User-Role': 'officer' },
    body: JSON.stringify(payload)
  });

  const text = await duplicate.text();
  console.log('STATUS', duplicate.status);
  console.log(text);

  if (duplicate.status !== 409) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

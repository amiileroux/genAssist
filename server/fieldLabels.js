// Mirrors the FIELD_LABELS map in public/js/records.js — keep both in sync
// if the quotation form's fields change.
const FIELD_LABELS = {
  proposerName: 'Name (Owner/s)',
  contactNo: 'Contact No.',
  dob1: 'Date of Birth #1',
  dob2: 'Date of Birth #2',
  address: 'Address',
  email: 'Email',
  dpNo: 'DP No/s.',
  issueDate1: 'Issue Date #1',
  expiryDate1: 'Expiry Date #1',
  issueDate2: 'Issue Date #2',
  expiryDate2: 'Expiry Date #2',
  occupation1: 'Occupation/Business #1',
  occupation2: 'Occupation/Business #2',
  make: 'Make',
  model: 'Model',
  useOfVehicle: 'Use of vehicle',
  registrationNo: 'Registration No.',
  yearOfManufacture: 'Year of manufacture',
  seatingCapacity: 'Seating capacity',
  ccHp: 'CC/HP',
  chassisNo: 'Chassis No.',
  engineNo: 'Engine No.',
  typeOfCoverage: 'Type of coverage',
  valueSumInsured: 'Value / Sum insured',
  vehicleMortgaged: 'Vehicle mortgaged',
  financialInstitution: 'Financial institution',
  previousInsurer: 'Previous insurer',
  noClaimDiscountYears: 'No Claim Discount (years)',
  antiTheftDevices: 'Anti-theft devices',
  windscreenLimit: 'Windscreen limit',
  lossOfUse: 'Loss of use',
  waiverOfExcess: 'Waiver of excess',
  personalAccident: 'Personal accident',
  specialPerils: 'Special perils',
  windscreenThirdPartyPrivate: 'Windscreen (TP Private)',
};

// Groups the same fields under the paper form's section headings, so an
// emailed quotation reads in clear blocks instead of one flat list, while
// each line stays independently copy-pasteable ("Label: value").
const FIELD_SECTIONS = [
  {
    title: 'PROPOSER DETAILS',
    keys: ['proposerName', 'contactNo', 'dob1', 'dob2', 'address', 'email', 'dpNo', 'issueDate1', 'expiryDate1', 'issueDate2', 'expiryDate2', 'occupation1', 'occupation2'],
  },
  {
    title: 'VEHICLE DETAILS',
    keys: ['make', 'model', 'useOfVehicle', 'registrationNo', 'yearOfManufacture', 'seatingCapacity', 'ccHp', 'chassisNo', 'engineNo'],
  },
  {
    title: 'COVERAGE DETAILS',
    keys: ['typeOfCoverage', 'valueSumInsured', 'vehicleMortgaged', 'financialInstitution', 'previousInsurer', 'noClaimDiscountYears', 'antiTheftDevices', 'windscreenLimit', 'lossOfUse', 'waiverOfExcess', 'personalAccident', 'specialPerils', 'windscreenThirdPartyPrivate'],
  },
];

module.exports = { FIELD_LABELS, FIELD_SECTIONS };

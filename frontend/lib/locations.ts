export const COUNTRY_LIST = [
  "United States",
  "Canada",
  "United Kingdom",
  "Australia",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Belgium",
  "Portugal",
  "Sweden",
  "Norway",
  "Denmark",
  "Finland",
  "Ireland",
  "Poland",
  "Czech Republic",
  "Austria",
  "Switzerland",
  "India",
  "China",
  "Japan",
  "South Korea",
  "Singapore",
  "Hong Kong",
  "United Arab Emirates",
  "Saudi Arabia",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Ghana",
  "Egypt",
  "Brazil",
  "Mexico",
  "Argentina",
  "Chile",
  "Colombia",
  "Peru",
  "New Zealand",
];

export const CITY_MAP: Record<string, string[]> = {
  "United States": ["New York", "Los Angeles", "Chicago", "Houston", "Miami", "San Francisco", "Seattle", "Boston", "Dallas", "Atlanta"],
  Canada: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
  Alberta: [
    "Calgary", "Edmonton", "Red Deer", "Lethbridge",
    "St. Albert", "Medicine Hat", "Grande Prairie",
    "Airdrie", "Spruce Grove", "Leduc", "Fort McMurray",
    "Okotoks", "Cochrane", "Camrose", "Lloydminster"
  ],
  "British Columbia": [
    "Vancouver", "Surrey", "Burnaby", "Richmond",
    "Abbotsford", "Coquitlam", "Kelowna", "Langley",
    "Saanich", "Delta", "Kamloops", "Nanaimo",
    "Chilliwack", "Maple Ridge", "Victoria", "Prince George"
  ],
  Ontario: [
    "Toronto", "Ottawa", "Mississauga", "Brampton",
    "Hamilton", "London", "Markham", "Vaughan",
    "Kitchener", "Windsor", "Burlington", "Oakville",
    "Richmond Hill", "Oshawa", "Barrie", "Kingston",
    "Guelph", "Thunder Bay", "Waterloo", "Cambridge"
  ],
  Quebec: [
    "Montreal", "Quebec City", "Laval", "Gatineau",
    "Longueuil", "Sherbrooke", "Saguenay", "Levis",
    "Trois-Rivieres", "Terrebonne", "Saint-Jean-sur-Richelieu",
    "Repentigny", "Brossard", "Drummondville", "Saint-Jerome"
  ],
  Manitoba: [
    "Winnipeg", "Brandon", "Steinbach", "Thompson",
    "Portage la Prairie", "Winkler", "Selkirk", "Morden"
  ],
  Saskatchewan: [
    "Saskatoon", "Regina", "Prince Albert", "Moose Jaw",
    "Swift Current", "Yorkton", "North Battleford", "Estevan"
  ],
  "Nova Scotia": [
    "Halifax", "Dartmouth", "Sydney", "Truro",
    "New Glasgow", "Glace Bay", "Bridgewater", "Amherst"
  ],
  "New Brunswick": [
    "Moncton", "Saint John", "Fredericton", "Dieppe",
    "Riverview", "Quispamsis", "Rothesay", "Miramichi"
  ],
  "Newfoundland and Labrador": [
    "St. John's", "Corner Brook", "Gander",
    "Grand Falls-Windsor", "Happy Valley-Goose Bay"
  ],
  "Prince Edward Island": [
    "Charlottetown", "Summerside", "Stratford", "Cornwall"
  ],
  "Northwest Territories": [
    "Yellowknife", "Hay River", "Inuvik", "Fort Smith"
  ],
  Nunavut: [
    "Iqaluit", "Rankin Inlet", "Arviat", "Baker Lake"
  ],
  Yukon: [
    "Whitehorse", "Dawson City", "Watson Lake", "Haines Junction"
  ],
  "United Kingdom": ["London", "Manchester", "Birmingham", "Leeds", "Glasgow"],
  Australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  Germany: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"],
  France: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice"],
  Spain: ["Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza"],
  Italy: ["Rome", "Milan", "Naples", "Turin", "Florence"],
  Netherlands: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"],
  Belgium: ["Brussels", "Antwerp", "Ghent", "Bruges", "Liège"],
  Portugal: ["Lisbon", "Porto", "Braga", "Coimbra", "Faro"],
  Sweden: ["Stockholm", "Gothenburg", "Malmö", "Uppsala", "Västerås"],
  Norway: ["Oslo", "Bergen", "Trondheim", "Stavanger", "Tromsø"],
  Denmark: ["Copenhagen", "Aarhus", "Odense", "Aalborg", "Esbjerg"],
  Finland: ["Helsinki", "Espoo", "Tampere", "Vantaa", "Oulu"],
  Ireland: ["Dublin", "Cork", "Limerick", "Galway", "Waterford"],
  Poland: ["Warsaw", "Krakow", "Wroclaw", "Poznan", "Gdansk"],
  "Czech Republic": ["Prague", "Brno", "Ostrava", "Plzen", "Liberec"],
  Austria: ["Vienna", "Graz", "Linz", "Salzburg", "Innsbruck"],
  Switzerland: ["Zurich", "Geneva", "Basel", "Lausanne", "Bern"],
  India: ["Mumbai", "Delhi", "Bengaluru", "Chennai", "Kolkata", "Hyderabad"],
  China: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu"],
  Japan: ["Tokyo", "Osaka", "Nagoya", "Sapporo", "Fukuoka"],
  "South Korea": ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon"],
  Singapore: ["Singapore"],
  "Hong Kong": ["Hong Kong"],
  "United Arab Emirates": ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain", "Ajman"],
  "Saudi Arabia": ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam"],
  "South Africa": ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"],
  Nigeria: ["Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt"],
  Kenya: ["Nairobi", "Mombasa", "Kisumu", "Eldoret", "Nakuru"],
  Ghana: ["Accra", "Kumasi", "Tamale", "Takoradi", "Cape Coast"],
  Egypt: ["Cairo", "Alexandria", "Giza", "Luxor", "Aswan"],
  Brazil: ["Sao Paulo", "Rio de Janeiro", "Brasilia", "Salvador", "Fortaleza"],
  Mexico: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Tijuana"],
  Argentina: ["Buenos Aires", "Cordoba", "Rosario", "Mendoza", "La Plata"],
  Chile: ["Santiago", "Valparaiso", "Concepcion", "Antofagasta", "Temuco"],
  Colombia: ["Bogota", "Medellin", "Cali", "Barranquilla", "Cartagena"],
  Peru: ["Lima", "Arequipa", "Trujillo", "Chiclayo", "Cusco"],
  "New Zealand": ["Auckland", "Wellington", "Christchurch", "Hamilton", "Dunedin"],
};

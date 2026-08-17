import "server-only";

/**
 * Built-in US freight markets — ships with the app, NOT user-entered. Brent
 * never creates markets, types cities, or sets radii: Reach already knows the
 * major metros and auto-maps his location to the nearest one.
 *
 * Each entry is [display name, representative downtown ZIP, default radius mi].
 * Center lat/long are derived at module load from the bundled `zipcodes`
 * dataset (the same source the farm-contact typeahead uses), so the single
 * source of truth is the ZIP — no hand-copied coordinates to drift.
 *
 * Radius guidance: denser eastern metros ~90–130 mi; spread-out
 * Plains/Mountain/West metros ~150–175 mi.
 */

import { lookupZip } from "@/lib/dispatch/distance";
import type { ReachMarket } from "./types";

// [name, downtown ZIP, default radius mi]
const RAW: ReadonlyArray<readonly [string, string, number]> = [
  // Texas
  ["Houston, TX area", "77002", 150],
  ["Dallas–Fort Worth area", "75201", 150],
  ["San Antonio, TX area", "78205", 150],
  ["Austin, TX area", "78701", 140],
  ["El Paso, TX area", "79901", 175],
  ["Lubbock, TX area", "79401", 175],
  ["Amarillo, TX area", "79101", 175],
  ["Midland–Odessa, TX area", "79701", 175],
  ["Corpus Christi, TX area", "78401", 150],
  ["Laredo, TX area", "78040", 150],
  ["McAllen, TX area", "78501", 140],
  ["Waco, TX area", "76701", 120],
  ["Beaumont, TX area", "77701", 120],
  ["Tyler, TX area", "75702", 120],
  // Oklahoma
  ["Oklahoma City, OK area", "73102", 150],
  ["Tulsa, OK area", "74103", 150],
  ["Lawton, OK area", "73501", 150],
  // Louisiana
  ["New Orleans, LA area", "70112", 130],
  ["Baton Rouge, LA area", "70801", 120],
  ["Shreveport, LA area", "71101", 140],
  ["Lafayette, LA area", "70501", 120],
  // Arkansas
  ["Little Rock, AR area", "72201", 140],
  ["Northwest Arkansas area", "72701", 130],
  ["Fort Smith, AR area", "72901", 130],
  // Mississippi
  ["Jackson, MS area", "39201", 130],
  ["Gulfport, MS area", "39501", 120],
  // Alabama
  ["Birmingham, AL area", "35203", 130],
  ["Montgomery, AL area", "36104", 130],
  ["Mobile, AL area", "36602", 130],
  ["Huntsville, AL area", "35801", 130],
  // Tennessee
  ["Memphis, TN area", "38103", 140],
  ["Nashville, TN area", "37203", 140],
  ["Knoxville, TN area", "37902", 130],
  ["Chattanooga, TN area", "37402", 120],
  // Georgia
  ["Atlanta, GA area", "30303", 150],
  ["Savannah, GA area", "31401", 130],
  ["Augusta, GA area", "30901", 120],
  ["Macon, GA area", "31201", 110],
  ["Columbus, GA area", "31901", 110],
  // Florida
  ["Jacksonville, FL area", "32202", 140],
  ["Orlando, FL area", "32801", 130],
  ["Tampa, FL area", "33602", 130],
  ["Miami, FL area", "33128", 140],
  ["Fort Myers, FL area", "33901", 120],
  ["Tallahassee, FL area", "32301", 130],
  ["Pensacola, FL area", "32502", 120],
  ["West Palm Beach, FL area", "33401", 110],
  ["Lakeland, FL area", "33801", 90],
  // South Carolina
  ["Charleston, SC area", "29401", 120],
  ["Columbia, SC area", "29201", 120],
  ["Greenville, SC area", "29601", 120],
  // North Carolina
  ["Charlotte, NC area", "28202", 130],
  ["Raleigh, NC area", "27601", 130],
  ["Greensboro, NC area", "27401", 110],
  ["Wilmington, NC area", "28401", 120],
  ["Asheville, NC area", "28801", 120],
  ["Fayetteville, NC area", "28301", 110],
  // Virginia
  ["Richmond, VA area", "23219", 120],
  ["Norfolk, VA area", "23510", 110],
  ["Roanoke, VA area", "24011", 120],
  // DC / Maryland
  ["Washington, DC area", "20001", 110],
  ["Baltimore, MD area", "21202", 100],
  ["Hagerstown, MD area", "21740", 100],
  // Pennsylvania
  ["Philadelphia, PA area", "19107", 100],
  ["Pittsburgh, PA area", "15222", 120],
  ["Harrisburg, PA area", "17101", 100],
  ["Allentown, PA area", "18101", 90],
  ["Scranton, PA area", "18503", 100],
  // New York
  ["New York, NY area", "10007", 90],
  ["Buffalo, NY area", "14202", 120],
  ["Albany, NY area", "12207", 110],
  ["Syracuse, NY area", "13202", 110],
  ["Rochester, NY area", "14604", 110],
  // New England
  ["Boston, MA area", "02108", 110],
  ["Hartford, CT area", "06103", 100],
  ["Providence, RI area", "02903", 90],
  ["Portland, ME area", "04101", 120],
  ["Manchester, NH area", "03101", 100],
  ["Springfield, MA area", "01103", 90],
  ["Burlington, VT area", "05401", 130],
  // New Jersey
  ["Newark, NJ area", "07102", 80],
  // Ohio
  ["Columbus, OH area", "43215", 120],
  ["Cleveland, OH area", "44113", 110],
  ["Cincinnati, OH area", "45202", 120],
  ["Toledo, OH area", "43604", 100],
  ["Dayton, OH area", "45402", 90],
  ["Akron, OH area", "44308", 90],
  // Michigan
  ["Detroit, MI area", "48226", 120],
  ["Grand Rapids, MI area", "49503", 120],
  ["Lansing, MI area", "48933", 100],
  ["Flint, MI area", "48502", 90],
  // Indiana
  ["Indianapolis, IN area", "46204", 130],
  ["Fort Wayne, IN area", "46802", 110],
  ["Evansville, IN area", "47708", 120],
  ["South Bend, IN area", "46601", 100],
  // Illinois
  ["Chicago, IL area", "60602", 120],
  ["Rockford, IL area", "61101", 100],
  ["Peoria, IL area", "61602", 110],
  ["Springfield, IL area", "62701", 110],
  ["Champaign, IL area", "61820", 100],
  // Wisconsin
  ["Milwaukee, WI area", "53202", 110],
  ["Madison, WI area", "53703", 110],
  ["Green Bay, WI area", "54301", 120],
  ["Eau Claire, WI area", "54701", 120],
  // Minnesota
  ["Minneapolis–St. Paul area", "55401", 150],
  ["Duluth, MN area", "55802", 150],
  ["Rochester, MN area", "55901", 120],
  // Iowa
  ["Des Moines, IA area", "50309", 150],
  ["Cedar Rapids, IA area", "52401", 120],
  ["Davenport, IA area", "52801", 110],
  ["Sioux City, IA area", "51101", 150],
  // Missouri
  ["St. Louis, MO area", "63101", 140],
  ["Kansas City, MO area", "64106", 150],
  ["Springfield, MO area", "65806", 140],
  ["Columbia, MO area", "65201", 120],
  ["Joplin, MO area", "64801", 130],
  // Kansas
  ["Wichita, KS area", "67202", 160],
  ["Topeka, KS area", "66603", 140],
  ["Salina, KS area", "67401", 160],
  ["Dodge City, KS area", "67801", 175],
  // Nebraska
  ["Omaha, NE area", "68102", 160],
  ["Lincoln, NE area", "68508", 150],
  ["Grand Island, NE area", "68801", 170],
  ["North Platte, NE area", "69101", 175],
  // Dakotas
  ["Fargo, ND area", "58102", 175],
  ["Bismarck, ND area", "58501", 175],
  ["Minot, ND area", "58701", 175],
  ["Sioux Falls, SD area", "57104", 175],
  ["Rapid City, SD area", "57701", 175],
  ["Aberdeen, SD area", "57401", 175],
  // Kentucky / West Virginia
  ["Louisville, KY area", "40202", 130],
  ["Lexington, KY area", "40507", 120],
  ["Bowling Green, KY area", "42101", 120],
  ["Charleston, WV area", "25301", 120],
  ["Huntington, WV area", "25701", 110],
  // Colorado
  ["Denver, CO area", "80202", 160],
  ["Colorado Springs, CO area", "80903", 150],
  ["Fort Collins, CO area", "80521", 120],
  ["Pueblo, CO area", "81003", 150],
  ["Grand Junction, CO area", "81501", 175],
  // Utah
  ["Salt Lake City, UT area", "84101", 175],
  ["Provo, UT area", "84601", 140],
  ["Ogden, UT area", "84401", 120],
  ["St. George, UT area", "84770", 175],
  // Wyoming / Montana
  ["Cheyenne, WY area", "82001", 175],
  ["Casper, WY area", "82601", 175],
  ["Billings, MT area", "59101", 175],
  ["Missoula, MT area", "59801", 175],
  ["Great Falls, MT area", "59401", 175],
  ["Bozeman, MT area", "59715", 175],
  // Idaho
  ["Boise, ID area", "83702", 175],
  ["Idaho Falls, ID area", "83402", 175],
  ["Pocatello, ID area", "83201", 175],
  ["Twin Falls, ID area", "83301", 175],
  ["Coeur d'Alene, ID area", "83814", 150],
  // New Mexico
  ["Albuquerque, NM area", "87102", 175],
  ["Las Cruces, NM area", "88001", 175],
  ["Santa Fe, NM area", "87501", 150],
  ["Roswell, NM area", "88201", 175],
  ["Farmington, NM area", "87401", 175],
  // Arizona
  ["Phoenix, AZ area", "85004", 160],
  ["Tucson, AZ area", "85701", 160],
  ["Flagstaff, AZ area", "86001", 175],
  ["Yuma, AZ area", "85364", 150],
  // Nevada
  ["Las Vegas, NV area", "89101", 175],
  ["Reno, NV area", "89501", 175],
  ["Elko, NV area", "89801", 175],
  // California
  ["Los Angeles, CA area", "90012", 110],
  ["San Diego, CA area", "92101", 110],
  ["San Francisco Bay area", "94103", 100],
  ["Sacramento, CA area", "95814", 130],
  ["Fresno, CA area", "93721", 140],
  ["Bakersfield, CA area", "93301", 140],
  ["Stockton, CA area", "95202", 110],
  ["Riverside–San Bernardino area", "92501", 110],
  ["Redding, CA area", "96001", 160],
  ["Salinas, CA area", "93901", 100],
  // Oregon
  ["Portland, OR area", "97204", 150],
  ["Eugene, OR area", "97401", 130],
  ["Medford, OR area", "97501", 150],
  ["Bend, OR area", "97701", 175],
  // Washington
  ["Seattle, WA area", "98104", 120],
  ["Spokane, WA area", "99201", 160],
  ["Tacoma, WA area", "98402", 90],
  ["Yakima, WA area", "98901", 140],
  ["Tri-Cities, WA area", "99336", 150],
];

/** Stable id from the display name, e.g. "houston-tx-area". */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let CACHE: ReachMarket[] | null = null;

/**
 * The built-in markets as ReachMarket[], sorted alphabetically by name (for the
 * "change market" picker). Coordinates resolved once per process from the ZIP.
 * Entries whose ZIP somehow can't resolve are dropped (shouldn't happen — all
 * ZIPs are verified against the dataset).
 */
export function builtInMarkets(): ReachMarket[] {
  if (CACHE) return CACHE;
  const list: ReachMarket[] = [];
  for (const [name, zip, radius] of RAW) {
    const hit = lookupZip(zip);
    if (!hit) continue;
    list.push({
      id: slugify(name),
      name,
      wording: name,
      centerZip: zip,
      centerLat: hit.lat,
      centerLon: hit.lon,
      radiusMi: radius,
      towns: null,
      notes: null,
      sortOrder: 0,
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  list.forEach((m, i) => {
    m.sortOrder = i;
  });
  CACHE = list;
  return CACHE;
}

/** Count of built-in markets (for reporting/tests). */
export const BUILT_IN_MARKET_COUNT = RAW.length;

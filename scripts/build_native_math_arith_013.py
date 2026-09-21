"""Build MATH_ARITH_013: measurement, conversions, elapsed time and dimensions."""
from native_number_foundations_common import *

theory = '''Measurement attaches a number to a unit so that a length, mass, time, or capacity can be interpreted. A bare 5 is incomplete when a question asks for distance or duration: 5 m, 5 kg, and 5 min are different quantities. Choose a unit that suits the scale, record the given unit, and convert with an equality before calculating. The equality 1 m = 100 cm is a relationship between units, not a statement that the physical length changed.

For a single dimension, conversion factors multiply by 1 in value. To convert 2.4 m to centimetres, use 2.4 m×(100 cm/1 m)=240 cm; the metres cancel. To convert 3500 g to kilograms, use 3500 g×(1 kg/1000 g)=3.5 kg. Larger units have more physical size, so the numerical count usually decreases when moving from small units to large units. Write the units through the calculation instead of relying only on a decimal-point memory trick.

Area and volume scale in powers of the linear conversion. Since 1 m=100 cm, a square metre is 1 m²=(100 cm)²=10,000 cm². A cubic metre is 1 m³=(100 cm)³=1,000,000 cm³. Converting 25,000 cm² to m² means divide by 10,000, giving 2.5 m²; dividing by 100 would be a one-dimensional conversion and would be wrong. For a box, 1 L=1000 cm³, so 2500 cm³=2.5 L. Count the dimension: length uses the factor once, area twice, and volume three times.

Perimeter adds lengths around a boundary; area measures a surface; volume measures occupied space. A rectangle 3 m by 2 m has perimeter 10 m and area 6 m². The units themselves help catch a category error: m cannot equal m², and adding 3 m to 2 m² is not meaningful. If dimensions are given in different units, convert them first, then apply the formula. A scale drawing may require converting the final area or volume with the correct power.

Elapsed time is a difference between instants, but clock notation is not ordinary decimal notation. From 09:35 to 11:10, count 25 minutes to 10:00 and 70 minutes from 10:00 to 11:10, for 95 minutes or 1 h 35 min. Borrow one hour as 60 minutes, not as 100. If a duration crosses midnight, split at 24:00. For a schedule, distinguish start time, end time, and duration; a break may need to be removed from the total.

Unit rates connect measurement to time or quantity: 180 km in 3 h is 60 km/h, while 3 h for 180 km is 1/60 h/km. Converting before dividing avoids hidden factors. For speed, distance = speed×time only when units are compatible; 90 km/h for 30 minutes uses 0.5 h and gives 45 km. For medication, recipes, or engineering, keep units attached so a conversion is visible and reversible.

Significant figures and rounding belong at the reporting stage. Keep exact conversion factors such as 100 cm per metre and 60 seconds per minute, then round a measured result according to the stated precision. A count of 60 seconds in a minute is a defined relationship; a stopwatch reading may be approximate. Check plausibility: converting metres to centimetres should increase the number by 100, while converting square metres to square centimetres should increase it by 10,000.

A reliable workflow is: name the quantity and unit, write a conversion equality, cancel units, calculate, and state the final unit. For time, draw a timeline or split at a convenient hour. The capstone combines mixed length units and area, asking you to square the conversion factor rather than reuse a one-dimensional factor.
Dimensional analysis is a cancellation argument. Write a conversion factor so the unit you do not want appears once in the numerator and once in the denominator. If a conversion factor is squared, both copies of the length unit are transformed: (1 m)²=(100 cm)². Do not convert a finished area by 100 and call the result square centimetres; the missing factor of 100 is a dimensional error, not a rounding issue.

Elapsed-time problems often combine a duration with a clock time. Add 95 minutes to 09:35 by adding 25 minutes to reach 10:00, then 70 more to reach 11:10. For a schedule with a break, calculate the gross interval first and subtract the break duration in minutes. For speeds, convert every time to hours or every distance to a matching unit before multiplying. A result such as 45 km is plausible for 90 km/h over half an hour; 2,700 km would reveal that minutes were treated as hours.
'''

examples = [
    example('Convert 2.4 m to centimetres.', '240 cm', 'Multiply by 100 cm per metre; metres cancel.'),
    example('Convert 3500 g to kilograms.', '3.5 kg', 'Divide by 1000 g per kilogram.'),
    example('Convert 1 m² to cm².', '10,000 cm²', 'Square the linear factor: 100²=10,000.'),
    example('Convert 1 m³ to cm³.', '1,000,000 cm³', 'Cube the linear factor: 100³=1,000,000.'),
    example('Find the area of a 3 m by 2 m rectangle.', '6 m²', 'Area is length×width; both dimensions use metres.'),
    example('Find the perimeter of the same rectangle.', '10 m', 'Perimeter is 2(3+2) metres.'),
    example('Elapsed time from 09:35 to 11:10?', '1 h 35 min', '25 minutes to 10:00 plus 70 minutes gives 95 minutes.'),
    example('How many seconds are in 2.5 minutes?', '150 s', 'Multiply by 60 seconds per minute.'),
    example('A car travels 90 km/h for 30 minutes. Distance?', '45 km', '30 minutes is 0.5 h; 90×0.5=45.'),
    example('Convert 2500 cm³ to litres.', '2.5 L', '1000 cm³=1 L, so divide by 1000.'),
]
apps = [
    application('Construction and floor plans', 'Length, area, and volume conversions prevent material estimates from mixing dimensions or units.'),
    application('Travel and timetables', 'Elapsed-time subtraction and unit rates turn departure, arrival, speed, and distance into compatible quantities.'),
    application('Cooking and science', 'Capacity, mass, and volume conversions let recipes and experiments scale without confusing litres with cubic centimetres.'),
    application('Health and engineering', 'Rates and dimensional checks expose unsafe unit mismatches before a dose, flow, or design value is used.'),
]
v = lambda lo, hi: {"type": "int", "min": lo, "max": hi}
questions = [
    generated('ARITH013_METRE_CM', 'Convert {m}/10 metres to centimetres.', {'m': v(10, 49)}, {'cm': 'm*10'}, '{cm}', 'One metre is 100 centimetres, so m/10 metres equals m×10 centimetres.', tags=['length_conversion']),
    generated('ARITH013_GRAM_KG', 'Convert {g} grams to kilograms.', {'g': v(1000, 9000)}, {'kg': 'g/1000'}, '{kg}', 'Divide grams by 1000 because 1000 g=1 kg.', tags=['mass_conversion']),
    fixed('ARITH013_AREA_FACTOR', 'For 1 m², enter the number of cm².', '10000', 'The linear factor 100 is squared: 100²=10,000.', tags=['area_conversion', 'squared_units']),
    fixed('ARITH013_VOLUME_FACTOR', 'For 1 m³, enter the number of cm³.', '1000000', 'The linear factor 100 is cubed: 100³=1,000,000.', tags=['volume_conversion', 'cubic_units']),
    fixed('ARITH013_AREA_CONVERT', 'Convert 25,000 cm² to m².', '2.5', 'Divide by 10,000 cm² per m².', tags=['area_conversion']),
    fixed('ARITH013_VOLUME_LITRE', 'Convert 2500 cm³ to litres.', '2.5', 'Divide by 1000 cm³ per litre.', tags=['volume_conversion']),
    fixed('ARITH013_RECT_AREA', 'A scale runs from 20 to 30 in five equal intervals. What value is at the third tick after 20?', '26', 'Each interval is (30−20)/5=2; the third tick is 20+3×2=26.', tags=['scale_reading', 'equal_intervals']),
    fixed('ARITH013_RECT_PERIMETER', 'Convert 1 m 35 cm to centimetres.', '135', '1 m=100 cm, so 100+35=135 cm.', tags=['mixed_units', 'length_conversion']),
    fixed('ARITH013_ELAPSED', 'From 09:35 to 11:10, enter elapsed minutes.', '95', '25 minutes to 10:00 plus 70 gives 95 minutes.', tags=['elapsed_time']),
    choice('ARITH013_CROSS_HOUR', 'Which unit is most appropriate for the distance between two nearby cities?', 'C', [('A', 'Millimetres'), ('B', 'Centimetres'), ('C', 'Kilometres'), ('D', 'Square metres')], 'A city-to-city distance is a length on a large scale, so kilometres are appropriate.', tags=['appropriate_units', 'length']),
    fixed('ARITH013_SECONDS', 'Enter seconds in 2.5 minutes.', '150', '2.5×60=150 seconds.', tags=['time_conversion']),
    fixed('ARITH013_SPEED', 'Convert 72 km/h to metres per second.', '20', '72×1000÷3600=20 m/s.', tags=['rate', 'mixed_units']),
    generated('ARITH013_SPEED_VAR', 'A cyclist travels at {speed} km/h for {half} half-hours. Enter distance in km.', {'speed': v(20, 80), 'half': v(2, 6)}, {'distance': 'speed*half/2'}, '{distance}', 'Each half-hour is 0.5 hours, so distance=speed×time.', tags=['rate', 'time_conversion']),
    fixed('ARITH013_DIMENSION_COUNT', 'Converting m to cm for an area requires using the factor how many times?', '2', 'Area has two length dimensions, so square the linear factor.', tags=['dimensional_powers']),
    choice('ARITH013_DIMENSION_CUBE', 'Which unit is most suitable for the capacity of a household water tank?', 'A', [('A', 'Litres'), ('B', 'Square centimetres'), ('C', 'Kilometres'), ('D', 'Seconds')], 'Capacity is a volume; litres are a practical capacity unit.', tags=['appropriate_units', 'volume']),
    choice('ARITH013_UNIT_CANCEL', 'In 2.4 m×(100 cm/1 m), which unit remains?', 'B', [('A', 'm'), ('B', 'cm'), ('C', 'm²'), ('D', 'cm³')], 'The metre units cancel, leaving centimetres.', tags=['unit_analysis']),
    choice('ARITH013_MIXED_DIMENSIONS', 'Which sum is dimensionally meaningful?', 'C', [('A', '3 m + 2 m²'), ('B', '4 kg + 2 L'), ('C', '3 m + 2 m'), ('D', '5 s + 1 km')], 'Only quantities with the same dimension and unit type can be added directly.', tags=['dimensional_reasoning']),
    fixed('ARITH013_MIDNIGHT', 'A trip starts 23:40 and ends 00:15 next day. Enter elapsed minutes.', '35', '20 minutes to midnight plus 15 minutes after midnight.', tags=['elapsed_time', 'midnight']),
    generated('ARITH013_CAPACITY', 'A tank holds {litres} litres. Enter capacity in cm³.', {'litres': v(2, 9)}, {'cm3': 'litres*1000'}, '{cm3}', 'One litre equals 1000 cubic centimetres.', tags=['volume_conversion']),
    capstone('ARITH013_CAPSTONE', 'A rectangular mat is 2.5 m long and 80 cm wide. Enter its area in square metres.', '2', ['Converts 80 cm to 0.80 m before applying the rectangle-area formula.', 'Calculates 2.5×0.80=2.0 and states square metres.', 'Explains why converting 80 cm as if it were 80 m, or using a one-dimensional factor on a finished area, would be inconsistent.'], '80 cm=0.80 m. Area=2.5 m×0.80 m=2.0 m². The conversion is done before multiplying the two perpendicular lengths.'),
]

figure('arith013-dimensional-powers.svg', 'One conversion factor, three dimensions', '<rect x="40" y="88" width="210" height="80" fill="#d9eee5"/><rect x="295" y="88" width="210" height="80" fill="#f5dfb5"/><rect x="550" y="88" width="210" height="80" fill="#e8d5ef"/><text x="145" y="137" text-anchor="middle" font-size="25">1 m = 100 cm</text><text x="400" y="137" text-anchor="middle" font-size="25">1 m² = 10,000 cm²</text><text x="655" y="137" text-anchor="middle" font-size="25">1 m³ = 1,000,000 cm³</text><text x="230" y="250" font-size="22">length once · area twice · volume three times</text>')
figure('arith013-time-line.svg', 'Elapsed time from 09:35 to 11:10', '<line x1="75" y1="160" x2="730" y2="160" stroke="#287365" stroke-width="5"/><circle cx="160" cy="160" r="12" fill="#d96d4f"/><circle cx="650" cy="160" r="12" fill="#d96d4f"/><text x="118" y="125" font-size="22">09:35</text><text x="606" y="125" font-size="22">11:10</text><text x="205" y="220" font-size="21">25 min</text><text x="420" y="220" font-size="21">70 min</text><text x="275" y="290" font-size="23">total 95 min = 1 h 35 min</text>')

save('MATH_ARITH_013', 'Measurement, unit conversions and elapsed time', theory, ['MATH_ARITH_009', 'MATH_ARITH_011'], examples, apps, questions, [media('arith013-dimensional-powers.svg', 'Three boxes show a linear metre-to-centimetre factor used once for length, twice for area, and three times for volume.', 'The dimension determines the power of the conversion factor.'), media('arith013-time-line.svg', 'A timeline splits 09:35 to 11:10 into 25 minutes and 70 minutes, totaling 95 minutes.', 'Clock subtraction uses 60 minutes per hour, not decimal hundreds.')], tags=['arithmetic', 'measurement', 'unit_conversions', 'elapsed_time', 'dimensional_analysis'])

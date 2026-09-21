import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonReferenceText} from './lesson-references.js';
test('theory references link only known native IDs and escape authored markup',()=>{
 const ids=new Set(['MATH_ARITH_006']);
 assert.equal(lessonReferenceText('Review MATH_ARITH_006.',ids),'Review <a href="#/lesson/MATH_ARITH_006">MATH_ARITH_006</a>.');
 assert.equal(lessonReferenceText('MATH_ARITH_999',ids),'MATH_ARITH_999');
 assert.equal(lessonReferenceText('<img onerror="bad"> & stuff',ids),'&lt;img onerror=&quot;bad&quot;&gt; &amp; stuff');
 assert.equal(lessonReferenceText('XMATH_ARITH_006suffix',ids),'XMATH_ARITH_006suffix');
});

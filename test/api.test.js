const {load}=require('./fake.js');const assert=require('assert');
const {post,get,sheets}=load();
let r=post({a:'lista'});assert(r.ok&&r.deportistas.length===0&&r.entrenador===false);
assert(!post({a:'coach',op:'todo',clave:'x'}).ok);
assert(post({a:'coach',op:'crearClave',clave:'abcd1'}).ok);
assert(!post({a:'coach',op:'crearClave',clave:'otra1'}).ok);
assert(post({a:'coach',op:'todo',clave:'abcd1'}).ok);
r=post({a:'coach',op:'guardar',clave:'abcd1',docs:[{tipo:'deportista',doc:{id:'d1',nombre:'Lucía',pin:'1234'}},{tipo:'ejercicio',doc:{id:'e1',nombre:'Sentadilla'}},{tipo:'ejercicio',doc:{id:'e2',nombre:'Otro'}},
 {tipo:'sesion',doc:{id:'s1',dep:'d1',fecha:'2026-11-02',titulo:'Fuerza A',deporte:'fuerza',bloques:[{nombre:'B1',items:[{ej:'e1',reps:'5'}]}]}}]});assert(r.ok);
r=post({a:'lista'});assert.strictEqual(JSON.stringify(r.deportistas),JSON.stringify([{id:'d1',nombre:'Lucía'}]));assert(r.entrenador);
assert(!post({a:'login',id:'d1',pin:'0000'}).ok);
r=post({a:'login',id:'d1',pin:'1234'});assert(r.ok&&r.sesiones.length===1&&r.ejercicios.length===1&&!('pin' in r.dep));
r=post({a:'registro',id:'d1',pin:'1234',reg:{id:'s1',fecha:'2026-11-02',rpe:7,minutos:60,sets:{}}});assert(r.ok);
assert.strictEqual(JSON.stringify(sheets.Carga.rows[1].slice(1,8)),JSON.stringify(['Lucía','Fuerza A','fuerza',60,7,420,'s1']));
post({a:'registro',id:'d1',pin:'1234',reg:{id:'s1',fecha:'2026-11-02',rpe:8,minutos:60}});
assert.strictEqual(sheets.Carga.rows.length,2);assert.strictEqual(sheets.Carga.rows[1][6],480);
r=post({a:'login',id:'d1',pin:'1234'});assert(r.registros.length===1&&r.registros[0].rpe===8);
// actualizar doc existente y borrar
post({a:'coach',op:'guardar',clave:'abcd1',docs:[{tipo:'ejercicio',doc:{id:'e2',nombre:'Otro2'}}]});
r=post({a:'coach',op:'todo',clave:'abcd1'});assert.strictEqual(r.datos.ejercicio.find(e=>e.id==='e2').nombre,'Otro2');assert.strictEqual(r.datos.ejercicio.length,2);
post({a:'coach',op:'borrar',clave:'abcd1',items:[{tipo:'ejercicio',id:'e2'},{tipo:'ejercicio',id:'e1'}]});
r=post({a:'coach',op:'todo',clave:'abcd1'});assert(!r.datos.ejercicio);assert.strictEqual(r.datos.registro.length,1);
// la app antigua sigue funcionando
r=post({items:[{atleta:'David',id:'x|1',fecha:'2026-10-26',kg:'50',ok:true}]});assert(r.ok);assert.strictEqual(sheets.Registro.rows.length,1);
console.log('API OK');

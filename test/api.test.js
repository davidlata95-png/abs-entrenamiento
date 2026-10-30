const {load}=require('./fake.js');const assert=require('assert');
const {post,get,sheets}=load();
let r=post({a:'lista'});assert(r.ok&&r.deportistas.length===0&&r.entrenador===false);
assert(!post({a:'coach',op:'todo',clave:'x'}).ok);
assert(post({a:'coach',op:'crearClave',clave:'abcd1'}).ok);
assert(!post({a:'coach',op:'crearClave',clave:'otra1'}).ok);
assert(post({a:'coach',op:'todo',clave:'abcd1'}).ok);
r=post({a:'coach',op:'guardar',clave:'abcd1',docs:[{tipo:'deportista',doc:{id:'d1',nombre:'Lucía',pin:'1234'}},{tipo:'ejercicio',doc:{id:'e1',nombre:'Sentadilla'}},{tipo:'ejercicio',doc:{id:'e2',nombre:'Otro'}},
 {tipo:'sesion',doc:{id:'s1',dep:'d1',fecha:'2026-11-02',titulo:'Fuerza A',deporte:'fuerza',bloques:[{nombre:'B1',items:[{ej:'e1',reps:'5'}]}]}}]});assert(r.ok);
r=post({a:'lista'});assert.strictEqual(JSON.stringify(r.deportistas),JSON.stringify([{id:'d1',nombre:'Lucía',nuevo:false}]));assert(r.entrenador);
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
// ---- grupos ----
const C={a:'coach',op:'guardar',clave:'abcd1'};
post({...C,docs:[{tipo:'grupo',doc:{id:'g1',nombre:'Preparación física CDNS',codigo:'CDNS'}},
 {tipo:'deportista',doc:{id:'d2',nombre:'Nerea López',pin:'',grupos:['g1']}},
 {tipo:'sesion',doc:{id:'gs1',grupo:'g1',fecha:'2026-11-02',titulo:'Día 1',deporte:'fuerza',diaTxt:'Día 1',plan:{semana:2},bloques:[{nombre:'Fuerza 1',items:[{nombre:'Peso muerto',reps:'5-5-3'}]}]}}]});
r=post({a:'lista',g:'cdns'});assert(r.grupo&&r.grupo.nombre==='Preparación física CDNS');assert.strictEqual(r.deportistas.length,1);assert(r.deportistas[0].nuevo);
assert(post({a:'lista',g:'MAL'}).grupoMal);
assert(!post({a:'registro',id:'d2',pin:'1111',reg:{id:'gs1'}}).ok,'sin PIN no se registra');
r=post({a:'login',id:'d2',pin:'4321'});assert(r.ok&&r.sesiones.length===1&&r.grupos[0].id==='g1','primer PIN queda guardado');
assert(!post({a:'login',id:'d2',pin:'1111'}).ok);
r=post({a:'unirse',g:'CDNS',nombre:'  nerea  lópez ',pin:'9999'});assert.strictEqual(r.error,'existe');
r=post({a:'unirse',g:'CDNS',nombre:'Raquel Tojo',pin:'5555'});assert(r.ok);const raq=r.id;
r=post({a:'unirse',g:'NO',nombre:'X',pin:'5555'});assert.strictEqual(r.error,'grupo');
r=post({a:'unirse',g:'CDNS',nombre:'Lucía',pin:'1234'});assert(r.ok&&r.id==='d1','deportista existente se une con su PIN');
r=post({a:'login',id:'d1',pin:'1234'});assert.strictEqual(r.sesiones.length,2);
r=post({a:'lista',g:'CDNS'});assert.strictEqual(r.deportistas.map(d=>d.nombre).join(','),'Lucía,Nerea López,Raquel Tojo');
// dos deportistas registran la misma sesión de grupo por separado
post({a:'registro',id:'d2',pin:'4321',reg:{id:'gs1',ses:'gs1',fecha:'2026-11-02',rpe:7,minutos:50,sets:{'0|0|0':{kg:'60',ok:true},'0|0|2':{kg:'70'}},coment:{'0|0':'Bien'}}});
post({a:'registro',id:raq,pin:'5555',reg:{id:'gs1',ses:'gs1',fecha:'2026-11-02',rpe:8,minutos:55,sets:{'0|0|0':{kg:'50'}}}});
r=post({a:'coach',op:'todo',clave:'abcd1'});const rg=r.datos.registro.filter(x=>x.ses==='gs1');
assert.strictEqual(rg.length,2);assert(rg.some(x=>x.id==='gs1~d2'));
const filasR=sheets.Registro.rows.filter(x=>x[1]==='Nerea López');assert.strictEqual(filasR.length,2);
assert.strictEqual(JSON.stringify(filasR[1].slice(2)),JSON.stringify(['2026-11-02',2,'Día 1','Fuerza 1','Peso muerto',3,'3',70,'','Nerea López|2026-11-02|0|0|2']));
assert.strictEqual(sheets.Comentarios.rows.find(x=>x[1]==='Nerea López')[6],'Bien');
r=post({a:'login',id:'d2',pin:'4321'});assert(r.registros.length===1&&r.registros[0].sets['0|0|2'].kg==='70');
assert.strictEqual(sheets.Carga.rows.filter(x=>x[7]==='gs1~d2')[0][6],350);
assert.strictEqual(post({a:'coach',op:'iaClave',clave:'abcd1'}).key,'');
assert(!post({a:'coach',op:'iaClave',clave:'mal'}).ok);
post({a:'coach',op:'iaGuardarClave',clave:'abcd1',key:' sk-ant-x '});assert.strictEqual(post({a:'coach',op:'iaClave',clave:'abcd1'}).key,'sk-ant-x');
assert(!('key' in post({a:'lista'})));
console.log('API OK');

/* User-controlled personal bookshelf. Independent of novel content and old study keys. */
'use strict';
(()=>{
 const KEY='plotlish.reader.library.v1';
 const ID=/^[a-z0-9][a-z0-9-]{1,99}$/;
 const norm=items=>[...new Set((Array.isArray(items)?items:[]).filter(v=>typeof v==='string'&&ID.test(v)))].slice(0,1000);
 function get(){try{const obj=JSON.parse(localStorage.getItem(KEY)||'null');return norm(obj?.schema===1?obj.items:[])}catch(e){return []}}
 function set(items){const next=norm(items);try{localStorage.setItem(KEY,JSON.stringify({schema:1,items:next}));return true}catch(e){return false}}
 function add(id){return ID.test(id)&&set([...get(),id])}
 function remove(id){return set(get().filter(item=>item!==id))}
 function merge(ids){return set([...get(),...norm(ids)])}
 function replace(ids){return set(norm(ids))}
 function has(id){return get().includes(id)}
 window.PlotlishLibrary=Object.freeze({KEY,get,set,add,remove,merge,replace,has,norm});
})();

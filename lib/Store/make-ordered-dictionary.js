"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = makeOrderedDictionary;
function makeOrderedDictionary(idGetter) {
    const array = [];
    const dict = {};
    const get = (id) => dict[id];
    const update = (item) => {
        const id = idGetter(item);
        const idx = array.findIndex(i => idGetter(i) === id);
        if (idx >= 0) {
            array[idx] = item;
            dict[id] = item;
            return true;
        }
        return false;
    };
    const upsert = (item, mode) => {
        const id = idGetter(item);
        if (get(id)) {
            update(item);
        }
        else {
            if (mode === 'append') {
                array.push(item);
            }
            else {
                array.splice(0, 0, item);
            }
            dict[id] = item;
        }
    };
    const remove = (item) => {
        const id = idGetter(item);
        const idx = array.findIndex(i => idGetter(i) === id);
        if (idx >= 0) {
            array.splice(idx, 1);
            delete dict[id];
            return true;
        }
        return false;
    };
    return {
        array,
        get,
        upsert,
        update,
        remove,
        updateAssign: (id, update) => {
            const item = get(id);
            if (item) {
                Object.assign(item, update);
                // Update dictionary key if id changed
                const newId = idGetter(item);
                if (newId !== id) {
                    delete dict[id];
                    dict[newId] = item;
                }
                return true;
            }
            return false;
        },
        clear: () => {
            array.splice(0, array.length);
            Object.keys(dict).forEach(key => {
                delete dict[key];
            });
        },
        filter: (contain) => {
            let i = 0;
            while (i < array.length) {
                if (!contain(array[i])) {
                    delete dict[idGetter(array[i])];
                    array.splice(i, 1);
                }
                else {
                    i += 1;
                }
            }
        },
        toJSON: () => array,
        fromJSON: (newItems) => {
            array.splice(0, array.length, ...newItems);
            // Rebuild dictionary from new array
            Object.keys(dict).forEach(key => delete dict[key]);
            newItems.forEach(item => {
                dict[idGetter(item)] = item;
            });
        }
    };
}

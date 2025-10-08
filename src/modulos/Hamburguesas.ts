import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";
const filePath = path.join(process.cwd(), "HamburguesasDB.json");

export default class Hamburguesas{
    static my = null
    private userStorage = new DataStorage<any>(new JSONFileAdapter(filePath));
    constructor(){
        if (Hamburguesas.my == null) Hamburguesas.my = new Hamburguesas();
        return Hamburguesas.my;
    }
    async add(id:string, data:any){
        await this.userStorage.save(id, data);
    }
    async get(id:string){
        return await this.userStorage.load(id);
    }
    async delete(id:string){
        await this.userStorage.delete(id);
    }
    async all(){
        return await this.userStorage.getAll();
    }
}



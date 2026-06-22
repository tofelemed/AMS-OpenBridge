using System;
using Npgsql;

class Program {
    static void Main() {
        var connStr = ""Host=172.28.230.150;Database=ams;Username=ams_user;Password=supersecurepassword123"";
        using var conn = new NpgsqlConnection(connStr);
        conn.Open();
        using var cmd = new NpgsqlCommand(""CREATE SCHEMA IF NOT EXISTS alarms;"", conn);
        cmd.ExecuteNonQuery();
        Console.WriteLine(""Schema created."");
    }
}

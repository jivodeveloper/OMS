import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from "react-native";
import { Checkbox, Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";

type Option = {
  label: string;
  value: number;
};

type Props = {
  label: string;
  data: Option[];
  values: number[];
  onChange: (values: number[]) => void;
  placeholder?: string;
  icon?: string;
};

export default function MultiSelectDialog({
  label,
  data,
  values,
  onChange,
  placeholder = "Select...",
  icon = "list-outline",
}: Props) {
  const [visible, setVisible] = useState(false);
  const [tempValues, setTempValues] = useState<number[]>(values);

  // Helper to determine if all items are selected
  const isAllSelected = data.length > 0 && tempValues.length === data.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      // If everything is already selected, clear the selection
      setTempValues([]);
    } else {
      // Otherwise, select all values from the data array
      const allIds = data.map((item) => item.value);
      setTempValues(allIds);
    }
  };

  const toggleValue = (val: number) => {
    if (tempValues.includes(val)) {
      setTempValues(tempValues.filter((v) => v !== val));
    } else {
      setTempValues([...tempValues, val]);
    }
  };

  const handleOpen = () => {
    setTempValues(values);
    setVisible(true);
  };

  const handleOk = () => {
    onChange(tempValues);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.input} onPress={handleOpen}>
        <View style={styles.row}>
          <Ionicons name={icon as any} size={18} color={COLORS.textSecondary} />
          <Text style={styles.inputText}>
            {values.length ? `${values.length} selected` : placeholder}
          </Text>
          <Ionicons name="chevron-down" size={18} />
        </View>
      </TouchableOpacity>

      <Modal transparent animationType="fade" visible={visible}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.title}>{label}</Text>

            {/* Select All Option */}
            <TouchableOpacity
              style={[styles.item, styles.selectAllContainer]}
              onPress={toggleSelectAll}
            >
              <Checkbox status={isAllSelected ? "checked" : "unchecked"} />
              <Text style={[styles.itemText, { fontWeight: "bold" }]}>
                Select All
              </Text>
            </TouchableOpacity>

            {/* <View style={styles.separator} /> */}

            <FlatList
              data={data}
              keyExtractor={(item) => item.value.toString()}
              renderItem={({ item }) => {
                const checked = tempValues.includes(item.value);
                return (
                  <TouchableOpacity
                    style={styles.item}
                    onPress={() => toggleValue(item.value)}
                  >
                    <Checkbox status={checked ? "checked" : "unchecked"} />
                    <Text style={styles.itemText}>{item.label}</Text>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.footer}>
              <Button mode="contained" onPress={handleOk}>
                OK
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  /* Field (Closed State) */
  selectAllContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 10,
    marginBottom: 5,
  },
  separator: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#fff",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  inputText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  /* Modal Overlay */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  /* Dialog Box */
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "70%",
    elevation: 5,
  },

  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 15,
    color: COLORS.textPrimary,
  },

  /* List Item */
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },

  itemText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  /* Footer */
  footer: {
    marginTop: 15,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 12,
    alignItems: "flex-end",
  },
});
